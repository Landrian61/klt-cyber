import { R2 } from "@convex-dev/r2";
import { ConvexError, v } from "convex/values";
import {
  LIBRARY_AUTHOR_MAX_LENGTH,
  LIBRARY_CATEGORY_NAME_MAX_LENGTH,
  LIBRARY_COVER_MAX_BYTES,
  LIBRARY_DEPARTMENT_NAME,
  LIBRARY_DESCRIPTION_MAX_LENGTH,
  LIBRARY_DETAIL_LINES_MAX,
  LIBRARY_DETAIL_LINE_MAX_LENGTH,
  LIBRARY_FILE_MAX_BYTES,
  LIBRARY_FILE_URL_TTL_SECONDS,
  LIBRARY_ITEM_FORMATS,
  LIBRARY_LOW_STOCK_THRESHOLD,
  LIBRARY_MOVEMENT_SCAN_CAP,
  LIBRARY_MOVER_DAYS,
  LIBRARY_PRICE_UGX_MAX,
  LIBRARY_PRICE_UGX_MIN,
  LIBRARY_STARTING_QUANTITY_MAX,
  LIBRARY_STARTING_QUANTITY_MIN,
  LIBRARY_STOCK_NOTE_MAX_LENGTH,
  LIBRARY_TARGET_TYPES,
  LIBRARY_TITLE_MAX_LENGTH,
  LIBRARY_TREND_MONTHS,
  isDigitalLibraryFormat,
  kampalaMonthKey,
  kampalaMonthWindow,
  isLibraryCoverContentType,
  isValidLibraryTypeFormat,
  matchesLibraryFormat,
  type LibraryErrorCode,
  type LibraryItemFormat,
} from "@klt-cyber/shared";
import { components, internal } from "./_generated/api";
import {
  action,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  departmentCapabilities,
  getCurrentUser,
  logActivity,
  requireDepartmentCapability,
  requireUser,
  resolveDepartmentShellRole,
} from "./lib/authz";
import {
  vLibraryItemFormat,
  vLibraryItemType,
  vLibraryStockDirection,
} from "./lib/libraryValidators";
import { resolveMediaUrl, toR2Key } from "./lib/media";
import { scheduleReplacedMediaCleanupMany } from "./lib/mediaCleanup";
import { resolveDepartmentAudience } from "./notifications";

/**
 * The Library catalogue, its free content and its stock (spec 0015).
 *
 * Two audiences, one table. Everything the church carries lives in
 * `libraryItems`, split by a `format` axis rather than by paid against free,
 * so a free teaching is discoverable beside the book it came from. The
 * operator half of this file (categories, items, stock, the team dashboard) is
 * gated on `manageLibrary`; the member half (`listCatalogue`,
 * `getCatalogueItem`, `getItemFileUrl`) needs a session and nothing more, per
 * F3-08.
 *
 * `manageLibrary` is a DEPARTMENT-SCOPED capability (convex/lib/authz.ts), so
 * it is held by Library's HOD, its delegates, its verified roster members and
 * a System Admin alike, and by nobody in any other department. "Operator"
 * below means exactly that set. SRS 4.13.2 asks for it: the Library's whole
 * roster runs the catalogue, with no appointment first.
 */

// Our own handle on the storage component. `convex/uploads.ts` keeps its
// instance private, and `convex/lib/media.ts` does the same, each for the same
// reason: the component client is cheap to construct and exporting it would
// invite a caller to reach past the auth-gated public API in uploads.ts.
const r2 = new R2(components.r2);

// ── Error helper ──────────────────────────────────────────────────────────

/**
 * Refuse with a code the form can map to a sentence (AC-7).
 *
 * A `ConvexError` carrying a code rather than a prose `Error`, because the
 * wording belongs to whichever surface is showing it. The default sentence
 * rides along so a caller that does not know the code still has something to
 * show; `libraryErrorMessage` in `@klt-cyber/shared` is the portal's mapping.
 */
function refuse(code: LibraryErrorCode, message?: string): never {
  throw new ConvexError({ code, ...(message ? { message } : {}) });
}

// ── The department, and who may act on it ─────────────────────────────────

/**
 * The Library department document.
 *
 * Found by name through `by_name`, from the one literal in
 * `@klt-cyber/shared`. `.first()` rather than `.unique()` deliberately:
 * Convex has no unique indexes, and a duplicate seeded row should give the
 * Library team a working page rather than a thrown query.
 */
async function libraryDepartment(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"departments"> | null> {
  return await ctx.db
    .query("departments")
    .withIndex("by_name", (q) => q.eq("name", LIBRARY_DEPARTMENT_NAME))
    .first();
}

/**
 * The caller as a Library operator, or null when they are not one.
 *
 * NULL rather than a throw, for every operator QUERY in this file. These back
 * live subscriptions: a page is mounted while its session drops, or while the
 * HOD who was looking at it has their appointment revoked, and the server
 * re-runs the subscription in that state. It has to deliver a value the page
 * can render as "signed out" rather than an exception thrown inside a mounted
 * `useQuery`, which takes the tree down with it. That is spec 0012's rule and
 * this feature keeps it.
 *
 * Mutations use {@link requireLibraryOperator} below, which throws: a mutation
 * reaching that point is a real violation, not a teardown race.
 */
async function libraryOperatorOrNull(ctx: QueryCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  const department = await libraryDepartment(ctx);
  if (!department) return null;
  const role = await resolveDepartmentShellRole(ctx, user._id, department._id);
  if (!role) return null;
  return departmentCapabilities(role, department.name).manageLibrary
    ? { user, department, role }
    : null;
}

/**
 * Assert the caller may run the catalogue, and hand back who they are.
 *
 * This is the boundary. The portal's navigation hides the three pages from
 * every other department and the sidebar hides them from a caller without the
 * capability, but both are convenience: a forged request lands here.
 */
async function requireLibraryOperator(ctx: MutationCtx) {
  const department = await libraryDepartment(ctx);
  if (!department) {
    throw new Error(
      `The ${LIBRARY_DEPARTMENT_NAME} department is not seeded, so the catalogue cannot be managed yet.`
    );
  }
  const { actor } = await requireDepartmentCapability(
    ctx,
    department._id,
    "manageLibrary"
  );
  return { actor, department };
}

// ── Ordering ──────────────────────────────────────────────────────────────

/**
 * Newest first, with ties broken by `_id` descending (AC-13, AC-25).
 *
 * Two rows saved in the same millisecond is not a hypothetical: a seed writes
 * a batch, and `createItem` followed immediately by an edit can land on the
 * same tick. Without a second key the two swap places between reads, so a list
 * reshuffles under the reader for no reason they can see.
 */
function newestFirst<T extends { createdAt: number; _id: string }>(
  a: T,
  b: T
): number {
  if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
  if (a._id === b._id) return 0;
  return a._id > b._id ? -1 : 1;
}

// ── Validation ────────────────────────────────────────────────────────────

/** Trim, then refuse an empty or over-long value. */
function cleanText(
  value: string | undefined,
  max: number,
  tooLong: LibraryErrorCode
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) refuse(tooLong);
  return trimmed;
}

/** The detail lines, trimmed, with the blanks dropped and the caps applied. */
function cleanDetailLines(
  lines: string[] | undefined
): string[] | undefined {
  if (lines === undefined) return undefined;
  const cleaned = lines.map((line) => line.trim()).filter((l) => l.length > 0);
  if (cleaned.length > LIBRARY_DETAIL_LINES_MAX) {
    refuse("LIBRARY_DETAIL_LINES_TOO_MANY");
  }
  if (cleaned.some((line) => line.length > LIBRARY_DETAIL_LINE_MAX_LENGTH)) {
    refuse("LIBRARY_DETAIL_LINE_TOO_LONG");
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

/** A whole number inside its bounds, or a refusal. */
function assertWholeNumber(
  value: number,
  min: number,
  max: number,
  code: LibraryErrorCode
): void {
  if (!Number.isInteger(value) || value < min || value > max) refuse(code);
}

/**
 * What R2 actually says about an object, checked against this catalogue's
 * limits (AC-18).
 *
 * Read from the storage component rather than taken from the client, which is
 * the whole point: a client that claims 2 MB for a 40 MB object it has already
 * uploaded gets refused here, and the stored `fileSizeBytes` is what R2
 * reports. Metadata missing means the client never called
 * `uploads.syncMetadata` after its PUT, so as far as the bucket is concerned
 * there is no object behind this key — the same answer as no file at all.
 */
async function readFileMetadata(
  ctx: MutationCtx,
  fileKey: string,
  format: LibraryItemFormat
): Promise<{ fileSizeBytes: number; fileContentType: string }> {
  const metadata = await r2.getMetadata(ctx, fileKey);
  if (!metadata) refuse("LIBRARY_FILE_REQUIRED");

  const size = metadata.size ?? 0;
  if (size > LIBRARY_FILE_MAX_BYTES) refuse("LIBRARY_FILE_TOO_LARGE");

  const contentType = metadata.contentType;
  if (!isDigitalLibraryFormat(format)) {
    // Unreachable through the mutations below, which only call this for a
    // digital item, but typed defensively rather than cast.
    refuse("LIBRARY_TYPE_FORMAT_MISMATCH");
  }
  if (!matchesLibraryFormat(format, contentType)) {
    refuse("LIBRARY_FILE_TYPE_UNSUPPORTED");
  }

  return { fileSizeBytes: size, fileContentType: contentType as string };
}

/**
 * The cover image, checked against its own, much lower cap (AC-18).
 *
 * Skipped entirely for an absolute URL: a seeded Unsplash cover is not one of
 * our objects, there is no metadata for it, and `toR2Key` is what makes that
 * distinction everywhere else in the codebase too.
 */
async function assertCoverWithinLimits(
  ctx: MutationCtx,
  coverImageUrl: string
): Promise<void> {
  const key = toR2Key(coverImageUrl);
  if (!key) return;

  const metadata = await r2.getMetadata(ctx, key);
  // A key with no metadata is left alone rather than refused: unlike a content
  // file, a cover is decoration, and failing the whole save over one would
  // cost the Library an item for the sake of a picture.
  if (!metadata) return;

  if ((metadata.size ?? 0) > LIBRARY_COVER_MAX_BYTES) {
    refuse("LIBRARY_COVER_TOO_LARGE");
  }
  if (!isLibraryCoverContentType(metadata.contentType)) {
    refuse("LIBRARY_COVER_TYPE_UNSUPPORTED");
  }
}

/** The category exists and is real, or a refusal. */
async function requireCategory(
  ctx: MutationCtx,
  categoryId: Id<"libraryCategories">
): Promise<Doc<"libraryCategories">> {
  const category = await ctx.db.get(categoryId);
  if (!category) refuse("LIBRARY_CATEGORY_NOT_FOUND");
  return category;
}

/**
 * A live item, or a refusal.
 *
 * A REMOVED item refuses every later mutation, including a further hide, an
 * edit or a stock movement (AC-9): its files are gone and its row exists only
 * for the audit trail. A HIDDEN item still accepts all of them, because hiding
 * is reversible and the team keeps working on it.
 */
async function requireLiveItem(
  ctx: MutationCtx,
  itemId: Id<"libraryItems">
): Promise<Doc<"libraryItems">> {
  const item = await ctx.db.get(itemId);
  if (!item || item.deletedAt !== undefined) refuse("LIBRARY_ITEM_NOT_FOUND");
  return item;
}

// ── The low stock latch (AC-26, AC-27) ────────────────────────────────────

/**
 * Whether this count change should alert, and what the latch becomes.
 *
 * `previous` is `"unbounded"` at creation, which is what makes AC-27 fall out
 * of the same rule rather than needing a second one: an item born at or below
 * the threshold is a crossing from "no count at all", so it alerts once.
 *
 * The three outcomes, in the order they are decided:
 *  - back above the threshold: the latch CLEARS, so the next crossing alerts
 *    again. No notice (nothing is wrong).
 *  - at or below, crossed from above, not already stamped: ALERT, stamp now.
 *  - at or below, anything else: no notice, keep whatever stamp there was.
 *    This is the case that stops a notice per movement while a shelf sits
 *    empty, including the movement that reaches zero.
 */
export function lowStockTransition(
  previous: number | "unbounded",
  next: number,
  stampedAt: number | undefined,
  now: number
): { alert: boolean; lowStockNotifiedAt: number | undefined } {
  if (next > LIBRARY_LOW_STOCK_THRESHOLD) {
    return { alert: false, lowStockNotifiedAt: undefined };
  }
  const wasAbove =
    previous === "unbounded" || previous > LIBRARY_LOW_STOCK_THRESHOLD;
  const alert = wasAbove && stampedAt === undefined;
  return { alert, lowStockNotifiedAt: alert ? now : stampedAt };
}

/**
 * Where a movement leaves the count, or `"insufficient"` when it cannot.
 *
 * Pure and exported for the same reason {@link lowStockTransition} is: the
 * guard that keeps `quantityOnHand` from ever going negative is the single
 * most important rule on this table, and the test harness cannot reach it
 * through `recordStockMovement` because that path resolves the caller through
 * the Better Auth component. So the rule lives here, the mutation calls it,
 * and the test exercises the same function the mutation does (AC-24, AC-32).
 */
export function applyMovement(
  before: number,
  direction: "in" | "out",
  quantity: number
): number | "insufficient" {
  const after = direction === "in" ? before + quantity : before - quantity;
  return after < 0 ? "insufficient" : after;
}

/**
 * True when moving from `from` to `to` would cross the physical/digital line.
 *
 * The rule an edit may never break (AC-8). Exported for testing, as above.
 */
export function crossesPhysicalDigitalLine(
  from: LibraryItemFormat,
  to: LibraryItemFormat
): boolean {
  return isDigitalLibraryFormat(from) !== isDigitalLibraryFormat(to);
}

/**
 * Tell the Library team something is running low (N43).
 *
 * Recipients are the union of two sets, deduplicated by user id: the
 * department's push audience (its `active` roster rows whose profile is
 * `verified`) and LIBRARY'S OWN active `hod` and `department_admin`.
 *
 * Note on that second set: the spec names `resolveRoleAudience`, but that
 * helper carries no department — the `role` audience variant deliberately
 * resolves holders of a role across every department — so using it would
 * have told all thirteen departments' heads that the Library is low on a
 * book. The SET the spec states is "Library's active hod and
 * department_admin", so that is what this reads, department-scoped, the same
 * shape `hasActiveDepartmentRole` uses.
 *
 * Delivered as a `users` audience rather than as two sends, so the in-app
 * bell's own audience check matches exactly who was pushed, and nobody who
 * holds both a roster row and an appointment is told twice.
 *
 * SCHEDULED rather than sent inline, because a mutation cannot push. The
 * actor is NOT excluded, matching how N22 treats its own: an operator who
 * takes the last few copies off the shelf should still get the notice they
 * just caused, since it is the one that says to reorder.
 */
async function scheduleLowStockNotice(
  ctx: MutationCtx,
  department: Doc<"departments">,
  item: Doc<"libraryItems">,
  quantityAfter: number,
  actorUserId: Id<"users">
): Promise<void> {
  const rosterAudience = await resolveDepartmentAudience(ctx, department._id);

  const appointments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_departmentId", (q) => q.eq("departmentId", department._id))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();
  const leaders = appointments
    .filter(
      (row) => row.roleType === "hod" || row.roleType === "department_admin"
    )
    .map((row) => row.userId);

  const userIds = [...new Set([...rosterAudience, ...leaders])];
  if (userIds.length === 0) return;

  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title: "Running low in the Library",
    body:
      quantityAfter === 0
        ? `${item.title} is out of stock.`
        : `${item.title} is down to ${quantityAfter}.`,
    audience: { type: "users" as const, userIds },
    // Restocking is portal work, like a profile review or a claim: the notice
    // says what is low and the Stock page is where the movement is recorded.
    deepLink: { type: "library_low_stock", id: item._id },
    createdBy: actorUserId,
    kind: "N43" as const,
  });
}

// ── Categories (L1-01, AC-11, AC-12) ──────────────────────────────────────

/**
 * Every category, in order, with how many live items sit on each.
 *
 * The count is what makes the delete guard legible before the operator tries
 * it: a category showing 12 items will refuse to be deleted, and seeing the 12
 * first is the difference between an informed choice and a surprise.
 */
export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    if (!(await libraryOperatorOrNull(ctx))) return null;

    const categories = await ctx.db
      .query("libraryCategories")
      .withIndex("by_order")
      .collect();

    return await Promise.all(
      categories.map(async (category) => {
        const items = await ctx.db
          .query("libraryItems")
          .withIndex("by_category", (q) => q.eq("categoryId", category._id))
          .collect();
        return {
          _id: category._id,
          name: category.name,
          order: category.order,
          hidden: category.hidden,
          // Live items only, so removing the last item does unblock the
          // delete (AC-11).
          itemCount: items.filter((i) => i.deletedAt === undefined).length,
        };
      })
    );
  },
});

/** Case-insensitive duplicate guard, used on create and on rename alike. */
async function assertCategoryNameFree(
  ctx: MutationCtx,
  name: string,
  exceptId?: Id<"libraryCategories">
): Promise<void> {
  const existing = await ctx.db.query("libraryCategories").collect();
  const taken = existing.some(
    (row) =>
      row._id !== exceptId &&
      row.name.toLowerCase() === name.toLowerCase()
  );
  if (taken) refuse("LIBRARY_CATEGORY_DUPLICATE");
}

export const createCategory = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const { actor, department } = await requireLibraryOperator(ctx);

    const cleaned = cleanText(
      name,
      LIBRARY_CATEGORY_NAME_MAX_LENGTH,
      "LIBRARY_CATEGORY_NAME_TOO_LONG"
    );
    if (!cleaned) refuse("LIBRARY_CATEGORY_NAME_REQUIRED");
    await assertCategoryNameFree(ctx, cleaned);

    // Appended at the end rather than inserted anywhere: a new category has no
    // natural position, and renumbering the whole list to make room for one is
    // work with nothing to show for it. The operator reorders afterwards if
    // they care where it sits.
    const siblings = await ctx.db
      .query("libraryCategories")
      .withIndex("by_order")
      .collect();
    const order =
      siblings.length === 0
        ? 0
        : Math.max(...siblings.map((row) => row.order)) + 1;

    const now = Date.now();
    const categoryId = await ctx.db.insert("libraryCategories", {
      name: cleaned,
      order,
      hidden: false,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "library.category_changed",
      targetType: LIBRARY_TARGET_TYPES.category,
      targetId: categoryId,
      departmentId: department._id,
      metadata: { change: "created", title: cleaned },
    });

    return categoryId;
  },
});

/**
 * Rename, reorder or hide a category.
 *
 * `order` is handled as a MOVE rather than as a write of one number: the
 * siblings are renumbered contiguously from zero in this same mutation, so no
 * two categories can end up sharing an order. Convex has no unique indexes, so
 * the alternative is a list whose chips render in an order nobody chose.
 */
export const updateCategory = mutation({
  args: {
    categoryId: v.id("libraryCategories"),
    name: v.optional(v.string()),
    order: v.optional(v.number()),
    hidden: v.optional(v.boolean()),
  },
  handler: async (ctx, { categoryId, name, order, hidden }) => {
    const { actor, department } = await requireLibraryOperator(ctx);
    const category = await requireCategory(ctx, categoryId);

    const patch: Partial<Doc<"libraryCategories">> = {};

    if (name !== undefined) {
      const cleaned = cleanText(
        name,
        LIBRARY_CATEGORY_NAME_MAX_LENGTH,
        "LIBRARY_CATEGORY_NAME_TOO_LONG"
      );
      if (!cleaned) refuse("LIBRARY_CATEGORY_NAME_REQUIRED");
      // The duplicate guard applies to a rename too, not just a create: a
      // rename is the easier of the two ways to end up with two "Teachings".
      await assertCategoryNameFree(ctx, cleaned, categoryId);
      patch.name = cleaned;
    }

    if (hidden !== undefined) patch.hidden = hidden;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(categoryId, { ...patch, updatedAt: Date.now() });
    }

    if (order !== undefined && order !== category.order) {
      await renumberCategories(ctx, categoryId, order);
    }

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "library.category_changed",
      targetType: LIBRARY_TARGET_TYPES.category,
      targetId: categoryId,
      departmentId: department._id,
      metadata: {
        change: "updated",
        title: patch.name ?? category.name,
        ...(hidden !== undefined ? { hidden } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });

    return null;
  },
});

/**
 * Move one category to `targetOrder` and renumber every sibling contiguously
 * from zero, in one transaction.
 */
async function renumberCategories(
  ctx: MutationCtx,
  movedId: Id<"libraryCategories">,
  targetOrder: number
): Promise<void> {
  const rows = await ctx.db
    .query("libraryCategories")
    .withIndex("by_order")
    .collect();

  const without = rows.filter((row) => row._id !== movedId);
  const moved = rows.find((row) => row._id === movedId);
  if (!moved) return;

  const index = Math.max(0, Math.min(Math.floor(targetOrder), without.length));
  const ordered = [...without.slice(0, index), moved, ...without.slice(index)];

  const now = Date.now();
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].order !== i) {
      await ctx.db.patch(ordered[i]._id, { order: i, updatedAt: now });
    }
  }
}

/**
 * Delete an empty category outright; refuse one still in use.
 *
 * The refusal names the COUNT, because "that category is in use" leaves the
 * operator with nothing to do about it, while "12 items still use it" tells
 * them exactly how much work emptying it is. A category that cannot be deleted
 * can always be hidden instead, which is the outcome they usually wanted.
 */
export const deleteCategory = mutation({
  args: { categoryId: v.id("libraryCategories") },
  handler: async (ctx, { categoryId }) => {
    const { actor, department } = await requireLibraryOperator(ctx);
    const category = await requireCategory(ctx, categoryId);

    const items = await ctx.db
      .query("libraryItems")
      .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
      .collect();
    // Live items only: a category whose last item has since been REMOVED is
    // empty as far as the catalogue is concerned, and holding it hostage to a
    // row that exists for the audit trail would be a dead end.
    const live = items.filter((item) => item.deletedAt === undefined).length;
    if (live > 0) {
      refuse(
        "LIBRARY_CATEGORY_IN_USE",
        `That category is still in use by ${live} ${live === 1 ? "item" : "items"}. Hide it instead, or move those items first.`
      );
    }

    await ctx.db.delete(categoryId);
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "library.category_changed",
      targetType: LIBRARY_TARGET_TYPES.category,
      targetId: categoryId,
      departmentId: department._id,
      metadata: { change: "deleted", title: category.name },
    });

    return null;
  },
});

// ── Items: shape validation shared by create and edit ─────────────────────

type ItemTextFields = {
  title?: string;
  description?: string;
  author?: string;
  detailLines?: string[];
};

/** The text fields, trimmed and capped. */
function cleanItemText(fields: ItemTextFields) {
  return {
    title: cleanText(
      fields.title,
      LIBRARY_TITLE_MAX_LENGTH,
      "LIBRARY_TITLE_TOO_LONG"
    ),
    description: cleanText(
      fields.description,
      LIBRARY_DESCRIPTION_MAX_LENGTH,
      "LIBRARY_DESCRIPTION_TOO_LONG"
    ),
    author: cleanText(
      fields.author,
      LIBRARY_AUTHOR_MAX_LENGTH,
      "LIBRARY_AUTHOR_TOO_LONG"
    ),
    detailLines: cleanDetailLines(fields.detailLines),
  };
}

// ── Items: create (AC-6, AC-7, AC-22, AC-27) ──────────────────────────────

export const createItem = mutation({
  args: {
    title: v.string(),
    categoryId: v.id("libraryCategories"),
    format: vLibraryItemFormat,
    itemType: vLibraryItemType,
    description: v.optional(v.string()),
    author: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    detailLines: v.optional(v.array(v.string())),
    // Physical only.
    priceUgx: v.optional(v.number()),
    startingQuantity: v.optional(v.number()),
    // Digital only.
    fileKey: v.optional(v.string()),
    // Accepted and DISCARDED. The form has it to hand and sends it, and taking
    // it would be trusting the client about the size of a limit the client is
    // subject to — the real figure is read back from R2 below (AC-18).
    fileSizeBytes: v.optional(v.number()),
    audioDurationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { actor, department } = await requireLibraryOperator(ctx);
    void args.fileSizeBytes;

    const text = cleanItemText(args);
    if (!text.title) refuse("LIBRARY_TITLE_REQUIRED");
    await requireCategory(ctx, args.categoryId);

    if (!isValidLibraryTypeFormat(args.itemType, args.format)) {
      refuse("LIBRARY_TYPE_FORMAT_MISMATCH");
    }

    if (args.coverImageUrl) {
      await assertCoverWithinLimits(ctx, args.coverImageUrl);
    }

    const now = Date.now();
    const physical = args.format === "physical";

    // The physical/digital invariant, written once at insert and never crossed
    // afterwards: price and count on one side, the three file fields on the
    // other, never both and never neither.
    let sideFields: Partial<Doc<"libraryItems">>;
    let startingQuantity = 0;

    if (physical) {
      if (args.priceUgx === undefined) refuse("LIBRARY_PRICE_REQUIRED");
      assertWholeNumber(
        args.priceUgx,
        LIBRARY_PRICE_UGX_MIN,
        LIBRARY_PRICE_UGX_MAX,
        "LIBRARY_PRICE_INVALID"
      );
      if (args.startingQuantity === undefined) {
        refuse("LIBRARY_QUANTITY_REQUIRED");
      }
      assertWholeNumber(
        args.startingQuantity,
        LIBRARY_STARTING_QUANTITY_MIN,
        LIBRARY_STARTING_QUANTITY_MAX,
        "LIBRARY_QUANTITY_INVALID"
      );
      startingQuantity = args.startingQuantity;
      sideFields = { priceUgx: args.priceUgx, quantityOnHand: startingQuantity };
    } else {
      if (!args.fileKey) refuse("LIBRARY_FILE_REQUIRED");
      const metadata = await readFileMetadata(ctx, args.fileKey, args.format);
      sideFields = {
        fileKey: args.fileKey,
        ...metadata,
        ...(args.format === "audio" && args.audioDurationSeconds !== undefined
          ? { audioDurationSeconds: args.audioDurationSeconds }
          : {}),
      };
    }

    const itemId = await ctx.db.insert("libraryItems", {
      title: text.title,
      ...(text.description ? { description: text.description } : {}),
      categoryId: args.categoryId,
      ...(text.author ? { author: text.author } : {}),
      ...(args.coverImageUrl ? { coverImageUrl: args.coverImageUrl } : {}),
      format: args.format,
      itemType: args.itemType,
      ...(text.detailLines ? { detailLines: text.detailLines } : {}),
      ...sideFields,
      hidden: false,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "library.item_created",
      targetType: LIBRARY_TARGET_TYPES.item,
      targetId: itemId,
      departmentId: department._id,
      metadata: { title: text.title, format: args.format },
    });

    if (physical) {
      // The starting quantity is written as the item's FIRST `in` movement, so
      // the count never moves without a movement behind it (AC-22). Zero is
      // still a movement: "we catalogued it with none on the shelf" is a fact
      // the history should carry rather than a gap.
      await ctx.db.insert("libraryStockMovements", {
        itemId,
        direction: "in",
        quantity: startingQuantity,
        quantityAfter: startingQuantity,
        note: "Starting quantity",
        actorUserId: actor._id,
        createdAt: now,
      });

      // An item born at or below the threshold alerts once, by the same
      // crossing rule with the previous count treated as unbounded (AC-27).
      const transition = lowStockTransition(
        "unbounded",
        startingQuantity,
        undefined,
        now
      );
      if (transition.alert) {
        await ctx.db.patch(itemId, {
          lowStockNotifiedAt: transition.lowStockNotifiedAt,
        });
        const item = await ctx.db.get(itemId);
        if (item) {
          await scheduleLowStockNotice(
            ctx,
            department,
            item,
            startingQuantity,
            actor._id
          );
        }
      }
    }

    return itemId;
  },
});

// ── Items: edit (AC-8) ────────────────────────────────────────────────────

export const updateItem = mutation({
  args: {
    itemId: v.id("libraryItems"),
    title: v.optional(v.string()),
    categoryId: v.optional(v.id("libraryCategories")),
    format: v.optional(vLibraryItemFormat),
    itemType: v.optional(vLibraryItemType),
    description: v.optional(v.string()),
    author: v.optional(v.string()),
    coverImageUrl: v.optional(v.string()),
    detailLines: v.optional(v.array(v.string())),
    priceUgx: v.optional(v.number()),
    fileKey: v.optional(v.string()),
    audioDurationSeconds: v.optional(v.number()),
    // Which optional fields this save actually CARRIED, as opposed to omitted.
    // An omitted optional argument and a cleared one both arrive as
    // `undefined`, and the difference decides whether a file gets deleted —
    // see `MediaReplacement.touched` in convex/lib/mediaCleanup.ts, which hit
    // exactly this problem first.
    cleared: v.optional(
      v.array(
        v.union(
          v.literal("description"),
          v.literal("author"),
          v.literal("coverImageUrl"),
          v.literal("detailLines"),
          v.literal("audioDurationSeconds")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    const { actor, department } = await requireLibraryOperator(ctx);
    const item = await requireLiveItem(ctx, args.itemId);
    const cleared = new Set(args.cleared ?? []);

    const nextFormat = args.format ?? item.format;
    const nextItemType = args.itemType ?? item.itemType;

    // The line an edit may never cross (AC-8). Moving a priced book with 30 on
    // the shelf to `pdf` would strand its price and its count on a row where
    // the invariant says neither belongs, and there is no sensible value to
    // put in their place. Removing the item and creating the right one keeps
    // the stock history attached to the thing it was actually about.
    if (crossesPhysicalDigitalLine(item.format, nextFormat)) {
      refuse("LIBRARY_FORMAT_IMMUTABLE");
    }
    if (!isValidLibraryTypeFormat(nextItemType, nextFormat)) {
      refuse("LIBRARY_TYPE_FORMAT_MISMATCH");
    }

    const text = cleanItemText(args);
    if (args.title !== undefined && !text.title) refuse("LIBRARY_TITLE_REQUIRED");
    if (args.categoryId !== undefined) {
      await requireCategory(ctx, args.categoryId);
    }

    const patch: Partial<Doc<"libraryItems">> = { updatedAt: Date.now() };

    if (text.title) patch.title = text.title;
    if (args.categoryId !== undefined) patch.categoryId = args.categoryId;
    if (args.format !== undefined) patch.format = args.format;
    if (args.itemType !== undefined) patch.itemType = args.itemType;

    for (const field of ["description", "author", "detailLines"] as const) {
      if (cleared.has(field)) {
        patch[field] = undefined;
      } else if (text[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (patch as any)[field] = text[field];
      }
    }

    // Cover: checked before it is stored, and the object it replaces is
    // scheduled for deletion after the patch commits.
    const coverTouched = args.coverImageUrl !== undefined || cleared.has("coverImageUrl");
    let nextCover = item.coverImageUrl;
    if (cleared.has("coverImageUrl")) {
      nextCover = undefined;
      patch.coverImageUrl = undefined;
    } else if (args.coverImageUrl !== undefined) {
      await assertCoverWithinLimits(ctx, args.coverImageUrl);
      nextCover = args.coverImageUrl;
      patch.coverImageUrl = args.coverImageUrl;
    }

    if (nextFormat === "physical") {
      if (args.priceUgx !== undefined) {
        assertWholeNumber(
          args.priceUgx,
          LIBRARY_PRICE_UGX_MIN,
          LIBRARY_PRICE_UGX_MAX,
          "LIBRARY_PRICE_INVALID"
        );
        patch.priceUgx = args.priceUgx;
      }
      // `quantityOnHand` is deliberately ABSENT from this mutation's writes.
      // `recordStockMovement` is its only writer, and any second one is a bug
      // — a count that can change without a movement behind it is a count
      // nobody can reconcile.
    }

    // Content file: a replacement re-reads the real size and content type from
    // R2 rather than carrying the old ones over, which is the difference
    // between a figure that describes the file and a figure that describes
    // whatever used to be there (AC-8).
    const fileTouched = args.fileKey !== undefined && args.fileKey !== item.fileKey;
    if (isDigitalLibraryFormat(nextFormat) && args.fileKey !== undefined) {
      if (args.fileKey.trim().length === 0) refuse("LIBRARY_FILE_REQUIRED");
      const metadata = await readFileMetadata(ctx, args.fileKey, nextFormat);
      patch.fileKey = args.fileKey;
      patch.fileSizeBytes = metadata.fileSizeBytes;
      patch.fileContentType = metadata.fileContentType;
    } else if (
      isDigitalLibraryFormat(nextFormat) &&
      args.format !== undefined &&
      args.format !== item.format &&
      item.fileKey
    ) {
      // pdf → audio, or audio → pdf, with the same file: the allowlist is per
      // format, so the existing object has to be re-checked against the new
      // one or an MP3 ends up being opened in a PDF sheet.
      const metadata = await readFileMetadata(ctx, item.fileKey, args.format);
      patch.fileContentType = metadata.fileContentType;
      patch.fileSizeBytes = metadata.fileSizeBytes;
    }

    if (nextFormat === "audio") {
      if (cleared.has("audioDurationSeconds")) {
        patch.audioDurationSeconds = undefined;
      } else if (args.audioDurationSeconds !== undefined) {
        patch.audioDurationSeconds = args.audioDurationSeconds;
      }
    }

    await ctx.db.patch(args.itemId, patch);

    await scheduleReplacedMediaCleanupMany(ctx, [
      { touched: coverTouched, previous: item.coverImageUrl, next: nextCover },
      { touched: fileTouched, previous: item.fileKey, next: args.fileKey },
    ]);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "library.item_updated",
      targetType: LIBRARY_TARGET_TYPES.item,
      targetId: args.itemId,
      departmentId: department._id,
      metadata: { title: patch.title ?? item.title },
    });

    return null;
  },
});

// ── Items: hide and remove (AC-9) ─────────────────────────────────────────

export const setItemHidden = mutation({
  args: { itemId: v.id("libraryItems"), hidden: v.boolean() },
  handler: async (ctx, { itemId, hidden }) => {
    const { actor, department } = await requireLibraryOperator(ctx);
    const item = await requireLiveItem(ctx, itemId);

    if (item.hidden !== hidden) {
      await ctx.db.patch(itemId, { hidden, updatedAt: Date.now() });
    }

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "library.item_hidden",
      targetType: LIBRARY_TARGET_TYPES.item,
      targetId: itemId,
      departmentId: department._id,
      metadata: { title: item.title, hidden },
    });

    return null;
  },
});

/**
 * Remove an item from the catalogue for good.
 *
 * SOFT, so the stock history survives: a disputed count six months from now is
 * answered by the movements, and deleting the row would delete the answer. The
 * FILES do go, because bytes nobody can reach are bytes nobody should pay to
 * store, and that is what makes this one-way — the row stays readable and the
 * PDF does not come back.
 */
export const removeItem = mutation({
  args: { itemId: v.id("libraryItems") },
  handler: async (ctx, { itemId }) => {
    const { actor, department } = await requireLibraryOperator(ctx);
    const item = await requireLiveItem(ctx, itemId);

    await ctx.db.patch(itemId, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
      coverImageUrl: undefined,
      fileKey: undefined,
    });

    // An absolute URL among these is skipped by `toR2Key` inside the helper: a
    // seeded Unsplash cover is not ours to delete.
    await scheduleReplacedMediaCleanupMany(ctx, [
      { touched: true, previous: item.coverImageUrl, next: undefined },
      { touched: true, previous: item.fileKey, next: undefined },
    ]);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "library.item_removed",
      targetType: LIBRARY_TARGET_TYPES.item,
      targetId: itemId,
      departmentId: department._id,
      metadata: { title: item.title },
    });

    return null;
  },
});

// ── Stock (AC-22 to AC-26) ────────────────────────────────────────────────

/**
 * Record stock going out or coming in.
 *
 * The count is computed HERE, from the item's freshly read `quantityOnHand`,
 * and the movement and the item are written in the same transaction — so the
 * two can never disagree and there is no window in which they do. Two
 * operators recording a movement at the same moment are safe because of
 * Convex's optimistic concurrency retry, not because of anything in this
 * function: the loser re-reads the new count and either succeeds against it or
 * is refused by the insufficient-stock guard below. A `quantityAfter` computed
 * from a client-supplied figure would have no such property.
 */
export const recordStockMovement = mutation({
  args: {
    itemId: v.id("libraryItems"),
    direction: vLibraryStockDirection,
    quantity: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { itemId, direction, quantity, note }) => {
    const { actor, department } = await requireLibraryOperator(ctx);
    const item = await requireLiveItem(ctx, itemId);

    if (item.format !== "physical") refuse("LIBRARY_STOCK_NOT_PHYSICAL");
    if (!Number.isInteger(quantity) || quantity <= 0) {
      refuse("LIBRARY_STOCK_QUANTITY_INVALID");
    }

    const cleanedNote = cleanText(
      note,
      LIBRARY_STOCK_NOTE_MAX_LENGTH,
      "LIBRARY_STOCK_NOTE_TOO_LONG"
    );

    // Computed from the item's FRESHLY READ count, never from client input.
    const before = item.quantityOnHand ?? 0;
    const result = applyMovement(before, direction, quantity);
    if (result === "insufficient") {
      refuse(
        "LIBRARY_STOCK_INSUFFICIENT",
        `There ${before === 1 ? "is" : "are"} only ${before} on the shelf.`
      );
    }
    const after = result;

    const now = Date.now();
    const transition = lowStockTransition(
      before,
      after,
      item.lowStockNotifiedAt,
      now
    );

    await ctx.db.insert("libraryStockMovements", {
      itemId,
      direction,
      quantity,
      quantityAfter: after,
      ...(cleanedNote ? { note: cleanedNote } : {}),
      actorUserId: actor._id,
      createdAt: now,
    });
    await ctx.db.patch(itemId, {
      quantityOnHand: after,
      lowStockNotifiedAt: transition.lowStockNotifiedAt,
      updatedAt: now,
    });

    if (transition.alert) {
      await scheduleLowStockNotice(ctx, department, item, after, actor._id);
    }

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "library.stock_recorded",
      targetType: LIBRARY_TARGET_TYPES.item,
      targetId: itemId,
      departmentId: department._id,
      metadata: {
        title: item.title,
        direction,
        quantity,
        quantityAfter: after,
      },
    });

    return { quantityAfter: after, lowStockAlerted: transition.alert };
  },
});

/** How many movements one page of the Stock page's history shows. */
const STOCK_PAGE_SIZE = 50;

export const listStockMovements = query({
  args: { itemId: v.id("libraryItems"), limit: v.optional(v.number()) },
  handler: async (ctx, { itemId, limit }) => {
    if (!(await libraryOperatorOrNull(ctx))) return null;

    const page = Math.min(limit ?? STOCK_PAGE_SIZE, 200);
    const rows = await ctx.db
      .query("libraryStockMovements")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .order("desc")
      // One extra, so the page can say whether there is more to load without a
      // second count query.
      .take(page + 1);

    const hasMore = rows.length > page;
    const movements = rows.slice(0, page).sort(newestFirst);

    const actorNames = new Map<string, string>();
    for (const userId of new Set(movements.map((m) => m.actorUserId))) {
      const user = await ctx.db.get(userId);
      const profile = user
        ? await ctx.db
            .query("memberProfiles")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .unique()
        : null;
      const name = [profile?.firstName, profile?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      // The row always resolves, because account deletion ANONYMISES the
      // `users` document rather than removing it. What it may not have is a
      // name, and "a former member" is a truer answer than a blank cell
      // (AC-25).
      actorNames.set(userId, name.length > 0 ? name : "a former member");
    }

    return {
      hasMore,
      movements: movements.map((movement) => ({
        _id: movement._id,
        direction: movement.direction,
        quantity: movement.quantity,
        quantityAfter: movement.quantityAfter,
        note: movement.note ?? null,
        createdAt: movement.createdAt,
        actorName: actorNames.get(movement.actorUserId) ?? "a former member",
      })),
    };
  },
});

// ── The team's own views (AC-6, AC-9, AC-28) ──────────────────────────────

/** One item as the team's pages show it: everything, including what is hidden. */
async function teamItem(ctx: QueryCtx, item: Doc<"libraryItems">) {
  const category = await ctx.db.get(item.categoryId);
  return {
    _id: item._id,
    title: item.title,
    description: item.description ?? null,
    categoryId: item.categoryId,
    categoryName: category?.name ?? null,
    author: item.author ?? null,
    coverImageUrl: await resolveMediaUrl(item.coverImageUrl),
    coverImageKey: item.coverImageUrl ?? null,
    format: item.format,
    itemType: item.itemType,
    detailLines: item.detailLines ?? [],
    priceUgx: item.priceUgx ?? null,
    fileKey: item.fileKey ?? null,
    fileSizeBytes: item.fileSizeBytes ?? null,
    fileContentType: item.fileContentType ?? null,
    audioDurationSeconds: item.audioDurationSeconds ?? null,
    quantityOnHand: item.quantityOnHand ?? null,
    lowStock:
      item.format === "physical" &&
      (item.quantityOnHand ?? 0) <= LIBRARY_LOW_STOCK_THRESHOLD,
    hidden: item.hidden,
    createdAt: item.createdAt,
  };
}

export const listItemsForTeam = query({
  args: {
    search: v.optional(v.string()),
    format: v.optional(vLibraryItemFormat),
    includeHidden: v.optional(v.boolean()),
  },
  handler: async (ctx, { search, format, includeHidden }) => {
    if (!(await libraryOperatorOrNull(ctx))) return null;

    const rows = await ctx.db
      .query("libraryItems")
      .withIndex("by_visibility", (q) => q.eq("deletedAt", undefined))
      .collect();

    const needle = search?.trim().toLowerCase() ?? "";
    const filtered = rows.filter((item) => {
      if (!includeHidden && item.hidden) return false;
      if (format && item.format !== format) return false;
      if (needle.length === 0) return true;
      return (
        item.title.toLowerCase().includes(needle) ||
        (item.author ?? "").toLowerCase().includes(needle)
      );
    });

    return await Promise.all(
      filtered.sort(newestFirst).map((item) => teamItem(ctx, item))
    );
  },
});

export const getItemForTeam = query({
  args: { itemId: v.id("libraryItems") },
  handler: async (ctx, { itemId }) => {
    if (!(await libraryOperatorOrNull(ctx))) return null;

    const item = await ctx.db.get(itemId);
    if (!item || item.deletedAt !== undefined) return null;

    const movements = await ctx.db
      .query("libraryStockMovements")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .order("desc")
      .take(10);

    return {
      ...(await teamItem(ctx, item)),
      recentMovements: movements.sort(newestFirst).map((movement) => ({
        _id: movement._id,
        direction: movement.direction,
        quantity: movement.quantity,
        quantityAfter: movement.quantityAfter,
        createdAt: movement.createdAt,
      })),
    };
  },
});

// ── The Library dashboard (spec 0017) ─────────────────────────────────────

/**
 * The Library dashboard, four tabs, four queries (spec 0017).
 *
 * One query per tab, so opening Collection does no stock work and a stock
 * movement never recomputes the catalogue mix. The admin portal only
 * subscribes a tab's query once that tab has been opened, which is the other
 * half of the same bargain (AC-24).
 *
 * Every one of the four gates on `manageLibrary` as its FIRST statement and
 * returns null to anyone else, exactly as the dashboard it replaces did: the
 * tabs are not a security boundary, this is (AC-28).
 *
 * Only the two tabs with a time window take `now`. The client supplies it
 * from the same minute clock the shared Dashboard uses, because `Date.now()`
 * inside a Convex query does not re-evaluate until something else invalidates
 * the subscription — so a page left open over midnight on the last day of a
 * month would keep bucketing into the old one. The server then converts that
 * instant to Kampala calendar boundaries with the fixed offset, so no bucket
 * ever depends on the viewer's timezone. Both halves matter (AC-25).
 *
 * **Every counting rule below this line is a pure exported function, not an
 * expression inlined in a handler.** These handlers resolve the caller through
 * the Better Auth component, which the test harness cannot stand up, so an
 * inlined rule would be a rule no test can reach (see `library.test.ts`). The
 * rules AC-29 names are therefore `summariseStock`, `summariseHealth`,
 * `summariseFormatMix`, `bucketMonthlyCounts`, `bucketMovements`,
 * `takeNewestWithinCap` and `newestVisible`, and each handler calls them
 * rather than restating them.
 */

/** How many recent additions and free highlights the dashboard cards list. */
const RECENT_ADDITIONS_CARD_SIZE = 5;
const FREE_HIGHLIGHTS_CARD_SIZE = 4;

/** How many free items the Free content tab's longer list shows (AC-20). */
const FREE_CONTENT_LIST_SIZE = 10;

/** How many items the "fastest moving" list ranks (AC-16). */
const STOCK_MOVERS_SIZE = 5;

/**
 * A share of the catalogue as whole percent, or null when there is nothing to
 * divide by.
 *
 * Null rather than zero on an empty denominator, so the panel can render its
 * empty state instead of a confident `0%` computed from nothing. Each share is
 * rounded independently and the set is NOT normalised to a hundred, so three
 * equal thirds honestly read 33, 33, 33 (AC-8, AC-11, AC-12).
 */
export function shareOf(count: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((count / total) * 100);
}

/** A non empty string after trimming, which is what "present" means (AC-11). */
function filled(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The Stock tab's figures, and Overview's combined one, from a single pass
 * (AC-13, AC-14).
 *
 * `runningLow` and `outOfStock` are DISJOINT: split at zero, neither
 * containing the other. `lowStockCombined` is their sum, which is exactly spec
 * 0015's definition and what Overview's card shows — so the two tabs cannot
 * drift apart, because one is defined as the sum of the other two rather than
 * computed a second way.
 *
 * Price rules: an unset `priceUgx` contributes zero to the shelf value, while
 * a price OF zero is a real price. That is why this checks for `undefined`
 * rather than for falsiness, and why `unpricedWithStock` counts only rows that
 * hold stock — an unpriced item holding none would contribute nothing to the
 * total either way, so naming it in the hint would be noise.
 */
export function summariseStock(
  rows: { quantityOnHand?: number; priceUgx?: number }[]
): {
  unitsOnHand: number;
  shelfValueUgx: number;
  unpricedWithStock: number;
  runningLow: number;
  outOfStock: number;
  lowStockCombined: number;
} {
  let unitsOnHand = 0;
  let shelfValueUgx = 0;
  let unpricedWithStock = 0;
  let runningLow = 0;
  let outOfStock = 0;
  for (const row of rows) {
    const quantity = row.quantityOnHand ?? 0;
    unitsOnHand += quantity;
    shelfValueUgx += (row.priceUgx ?? 0) * quantity;
    if (quantity > 0 && row.priceUgx === undefined) unpricedWithStock += 1;
    if (quantity === 0) outOfStock += 1;
    else if (quantity <= LIBRARY_LOW_STOCK_THRESHOLD) runningLow += 1;
  }
  return {
    unitsOnHand,
    shelfValueUgx,
    unpricedWithStock,
    runningLow,
    outOfStock,
    lowStockCombined: runningLow + outOfStock,
  };
}

/** The catalogue health fields, in the order the panel shows them. */
export const LIBRARY_HEALTH_FIELDS = ["cover", "author", "description"] as const;

/**
 * Catalogue health: three independent shares of the live catalogue (AC-11,
 * AC-12).
 *
 * The denominator is every row handed in, hidden included, because this is the
 * team's own view of what they hold (AC-26). A `coverImageUrl` holding a
 * seeded absolute URL counts as a cover, since the member sees a cover either
 * way — which falls out of asking only whether the string is non empty.
 *
 * On an empty catalogue every share is null, never zero and never a hundred.
 */
export function summariseHealth(
  rows: {
    coverImageUrl?: string;
    author?: string;
    description?: string;
  }[]
): {
  field: (typeof LIBRARY_HEALTH_FIELDS)[number];
  present: number;
  missing: number;
  share: number | null;
}[] {
  const total = rows.length;
  const present: Record<string, number> = {
    cover: 0,
    author: 0,
    description: 0,
  };
  for (const row of rows) {
    if (filled(row.coverImageUrl)) present.cover += 1;
    if (filled(row.author)) present.author += 1;
    if (filled(row.description)) present.description += 1;
  }
  return LIBRARY_HEALTH_FIELDS.map((field) => ({
    field,
    present: present[field],
    missing: total - present[field],
    share: shareOf(present[field], total),
  }));
}

/**
 * The catalogue's format mix (AC-8).
 *
 * Driven off the shared union rather than off what happens to be in the table,
 * so a format nobody has filed anything under yet still appears as an honest
 * zero instead of silently leaving the chart. Hidden rows are counted, per
 * AC-26.
 */
export function summariseFormatMix(
  rows: { format: LibraryItemFormat }[]
): { format: LibraryItemFormat; count: number; share: number | null }[] {
  const total = rows.length;
  return LIBRARY_ITEM_FORMATS.map((format) => {
    const count = rows.filter((row) => row.format === format).length;
    return { format, count, share: shareOf(count, total) };
  });
}

/**
 * Timestamps bucketed into a fixed window of Kampala month keys (AC-10).
 *
 * The keys are generated up front and zero filled, so the series is always
 * exactly as long as the window and a quiet month is a zero rather than a
 * missing point. Anything falling outside the window is dropped rather than
 * folded into the nearest bucket.
 */
export function bucketMonthlyCounts(
  keys: string[],
  timestamps: number[]
): { month: string; count: number }[] {
  const counts = new Map(keys.map((key) => [key, 0]));
  for (const timestamp of timestamps) {
    const key = kampalaMonthKey(timestamp);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return keys.map((key) => ({ month: key, count: counts.get(key) ?? 0 }));
}

/**
 * Movements bucketed into the same window, in against out (AC-15).
 *
 * A movement counts in its own month whatever later happened to its item: a
 * removed item's history still happened and the stock still moved, so nothing
 * here looks at the item at all.
 */
export function bucketMovements(
  keys: string[],
  movements: { createdAt: number; direction: "in" | "out"; quantity: number }[]
): { month: string; in: number; out: number }[] {
  const buckets = new Map(keys.map((key) => [key, { in: 0, out: 0 }]));
  for (const movement of movements) {
    const bucket = buckets.get(kampalaMonthKey(movement.createdAt));
    if (!bucket) continue;
    if (movement.direction === "in") bucket.in += movement.quantity;
    else bucket.out += movement.quantity;
  }
  return keys.map((key) => ({
    month: key,
    in: buckets.get(key)?.in ?? 0,
    out: buckets.get(key)?.out ?? 0,
  }));
}

/**
 * Trim a DESCENDING movement read to the cap, and say where coverage begins
 * (AC-22, AC-23).
 *
 * Descending is load bearing, not a preference. The read takes one row past
 * the cap so reaching it is DETECTED exactly rather than inferred from a
 * length that might just happen to equal the cap; and because the rows arrive
 * newest first, trimming the tail costs the OLDEST months. An ascending read
 * truncated the same way would drop the newest movements, silently emptying
 * the current month and the ninety day movers while the page claimed only to
 * be partial.
 *
 * `coverageFrom` names the month coverage actually begins at rather than
 * merely reporting "partial", because that first covered month's own totals
 * are themselves incomplete and a reader has to know which bar to distrust.
 */
export function takeNewestWithinCap<T extends { createdAt: number }>(
  scanned: T[],
  cap: number
): { movements: T[]; partial: boolean; coverageFrom: string | null } {
  const partial = scanned.length > cap;
  const movements = partial ? scanned.slice(0, cap) : scanned;
  return {
    movements,
    partial,
    coverageFrom:
      partial && movements.length > 0
        ? kampalaMonthKey(movements[movements.length - 1].createdAt)
        : null,
  };
}

/**
 * The newest items a MEMBER could see (AC-6, AC-20, AC-26).
 *
 * Hidden excluded here and only here. These are the two lists SRS 4.13.3 names
 * and spec 0015 defined that way: they answer "what has the congregation just
 * been given", which a hidden item has not. Every figure elsewhere on this
 * dashboard counts hidden rows, because hidden means hidden from members and
 * never hidden from the team's own counts.
 */
export function newestVisible<
  T extends {
    _id: string;
    createdAt: number;
    hidden: boolean;
    format: LibraryItemFormat;
  },
>(items: T[], size: number, digitalOnly = false): T[] {
  return items
    .filter((item) => !item.hidden)
    .filter((item) => !digitalOnly || isDigitalLibraryFormat(item.format))
    .sort(newestFirst)
    .slice(0, size);
}

/**
 * Every item the Library still holds: not removed, hidden included.
 *
 * Hidden means hidden from MEMBERS, never hidden from the team's own counts —
 * something withdrawn from the app is still on the shelf and still cost money.
 */
async function liveItems(ctx: QueryCtx): Promise<Doc<"libraryItems">[]> {
  return await ctx.db
    .query("libraryItems")
    .withIndex("by_visibility", (q) => q.eq("deletedAt", undefined))
    .collect();
}

/**
 * Every physical item the Library still holds.
 *
 * `format` sits in the `by_stock` key for a reason: a digital item has no
 * `quantityOnHand`, undefined sorts first in Convex, and an index without
 * `format` would report every PDF in the catalogue as low stock.
 */
async function livePhysicalItems(
  ctx: QueryCtx
): Promise<Doc<"libraryItems">[]> {
  return await ctx.db
    .query("libraryItems")
    .withIndex("by_stock", (q) =>
      q.eq("deletedAt", undefined).eq("format", "physical")
    )
    .collect();
}

/** One item as a dashboard card or list row shows it. */
async function dashboardItem(item: Doc<"libraryItems">) {
  return {
    _id: item._id,
    title: item.title,
    format: item.format,
    itemType: item.itemType,
    coverImageUrl: await resolveMediaUrl(item.coverImageUrl),
    createdAt: item.createdAt,
  };
}

export const getLibraryOverview = query({
  args: {},
  handler: async (ctx) => {
    if (!(await libraryOperatorOrNull(ctx))) return null;

    const live = await liveItems(ctx);

    // Spec 0015's combined low stock count, kept exactly: physical items at or
    // BELOW the threshold, which INCLUDES items sitting at zero. The Stock tab
    // splits the same population into two disjoint figures (AC-13), so this
    // card's hint has to say in words that zero is counted here, or the two
    // tabs look like they contradict each other (AC-6).
    const lowStockRows = await ctx.db
      .query("libraryItems")
      .withIndex("by_stock", (q) =>
        q
          .eq("deletedAt", undefined)
          .eq("format", "physical")
          .lte("quantityOnHand", LIBRARY_LOW_STOCK_THRESHOLD)
      )
      .collect();

    return {
      totalItems: live.length,
      // Why the difference between the catalogue total and what the
      // congregation can see is explainable rather than mysterious (AC-7).
      hiddenCount: live.filter((item) => item.hidden).length,
      lowStockCount: lowStockRows.length,
      recentAdditions: await Promise.all(
        newestVisible(live, RECENT_ADDITIONS_CARD_SIZE).map(dashboardItem)
      ),
      freeHighlights: await Promise.all(
        newestVisible(live, FREE_HIGHLIGHTS_CARD_SIZE, true).map(dashboardItem)
      ),
    };
  },
});

export const getLibraryCollection = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    if (!(await libraryOperatorOrNull(ctx))) return null;

    const live = await liveItems(ctx);

    // ── Items per category (AC-9) ────────────────────────────────────────
    const perCategory = new Map<string, number>();
    for (const item of live) {
      const key = item.categoryId as string;
      perCategory.set(key, (perCategory.get(key) ?? 0) + 1);
    }

    const categories: {
      categoryId: string | null;
      name: string;
      order: number;
      count: number;
    }[] = [];
    let uncategorised = 0;
    for (const [categoryId, count] of perCategory) {
      const category = await ctx.db.get(categoryId as Id<"libraryCategories">);
      if (!category) {
        // A guard, not an expected state: `deleteCategory` refuses while any
        // item references the category. If one ever does go missing the items
        // still have to be counted somewhere visible rather than vanishing.
        uncategorised += count;
        continue;
      }
      // A hidden category still appears under its own name, matching spec
      // 0015's AC-12: an item filed under a retired category reads as that
      // category and not as uncategorised.
      categories.push({
        categoryId,
        name: category.name,
        order: category.order,
        count,
      });
    }
    if (uncategorised > 0) {
      categories.push({
        categoryId: null,
        name: "Uncategorised",
        order: Number.MAX_SAFE_INTEGER,
        count: uncategorised,
      });
    }
    // Count descending, then the category's own order ascending, then name,
    // so the list is stable between reads rather than reshuffling on a tie.
    categories.sort(
      (a, b) =>
        b.count - a.count || a.order - b.order || a.name.localeCompare(b.name)
    );

    const { keys } = kampalaMonthWindow(now, LIBRARY_TREND_MONTHS);

    return {
      totalItems: live.length,
      formatMix: summariseFormatMix(live),
      categories,
      monthlyAdditions: bucketMonthlyCounts(
        keys,
        live.map((item) => item.createdAt)
      ),
      health: summariseHealth(live),
    };
  },
});

export const getLibraryStock = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    if (!(await libraryOperatorOrNull(ctx))) return null;

    const physical = await livePhysicalItems(ctx);

    // All four figures come off this one scan rather than off a second
    // `by_stock` read, which is what makes them and the list below unable to
    // disagree (AC-13, AC-17).
    const figures = summariseStock(physical);

    const lowStockList = physical
      .filter(
        (item) => (item.quantityOnHand ?? 0) <= LIBRARY_LOW_STOCK_THRESHOLD
      )
      .sort(
        (a, b) =>
          (a.quantityOnHand ?? 0) - (b.quantityOnHand ?? 0) ||
          a.title.localeCompare(b.title)
      )
      .map((item) => ({
        _id: item._id,
        title: item.title,
        quantityOnHand: item.quantityOnHand ?? 0,
        priceUgx: item.priceUgx ?? null,
      }));

    // ── The ONE movement read (AC-21, AC-22) ────────────────────────────
    // Both the monthly buckets and the ninety day movers are derived from this
    // single result. A second read of `libraryStockMovements` in this handler
    // is a defect. Reading `libraryItems` here is expected.
    const { keys, startedAt } = kampalaMonthWindow(now, LIBRARY_TREND_MONTHS);
    const scanned = await ctx.db
      .query("libraryStockMovements")
      .withIndex("by_created", (q) => q.gte("createdAt", startedAt))
      .order("desc")
      .take(LIBRARY_MOVEMENT_SCAN_CAP + 1);

    const { movements, partial, coverageFrom } = takeNewestWithinCap(
      scanned,
      LIBRARY_MOVEMENT_SCAN_CAP
    );

    // ── The fastest moving items (AC-16) ────────────────────────────────
    // A narrowing of the same result, not a second question put to the table.
    const moverSince = now - LIBRARY_MOVER_DAYS * 86_400_000;
    const moverTotals = new Map<string, number>();
    for (const movement of movements) {
      if (movement.direction !== "out") continue;
      if (movement.createdAt < moverSince) continue;
      const key = movement.itemId as string;
      moverTotals.set(key, (moverTotals.get(key) ?? 0) + movement.quantity);
    }

    // Ranked by quantity out descending, then by title. Items removed since
    // are dropped, because a removed item is not something the team can
    // restock; hidden items stay, per AC-26.
    //
    // Resolved lazily down the sorted list rather than by reading every item
    // in the window: the walk stops as soon as five survive AND the next
    // candidate's quantity is strictly lower, so a tie straddling the fifth
    // place is still resolved by title rather than by read order.
    const ranked = [...moverTotals.entries()].sort((a, b) => b[1] - a[1]);
    const movers: { _id: string; title: string; quantityOut: number }[] = [];
    for (const [itemId, quantityOut] of ranked) {
      if (
        movers.length >= STOCK_MOVERS_SIZE &&
        quantityOut < movers[STOCK_MOVERS_SIZE - 1].quantityOut
      ) {
        break;
      }
      const item = await ctx.db.get(itemId as Id<"libraryItems">);
      if (!item || item.deletedAt !== undefined) continue;
      movers.push({ _id: itemId, title: item.title, quantityOut });
    }
    movers.sort(
      (a, b) => b.quantityOut - a.quantityOut || a.title.localeCompare(b.title)
    );

    return {
      physicalItems: physical.length,
      unitsOnHand: figures.unitsOnHand,
      shelfValueUgx: figures.shelfValueUgx,
      unpricedWithStock: figures.unpricedWithStock,
      runningLow: figures.runningLow,
      outOfStock: figures.outOfStock,
      lowStockList,
      monthlyMovements: bucketMovements(keys, movements),
      movers: movers.slice(0, STOCK_MOVERS_SIZE),
      moverDays: LIBRARY_MOVER_DAYS,
      partial,
      coverageFrom,
    };
  },
});

export const getLibraryFreeContent = query({
  args: {},
  handler: async (ctx) => {
    if (!(await libraryOperatorOrNull(ctx))) return null;

    const live = await liveItems(ctx);
    const digital = live.filter((item) => isDigitalLibraryFormat(item.format));

    // Hidden included in the FIGURES, which are the team's own view of what
    // they hold and what it costs in storage. Only the list below excludes
    // hidden items, on the same rule as Overview's highlights (AC-18, AC-26).
    let totalBytes = 0;
    let missingSize = 0;
    for (const item of digital) {
      // The size R2 reported at upload, which spec 0015 already stores. An
      // item with no recorded size contributes zero and is named in the hint,
      // so a total that is short is never silently short.
      if (item.fileSizeBytes === undefined) missingSize += 1;
      else totalBytes += item.fileSizeBytes;
    }

    return {
      pdfCount: digital.filter((item) => item.format === "pdf").length,
      recordingCount: digital.filter((item) => item.format === "audio").length,
      totalBytes,
      missingSize,
      // "Recently added", not "recently published": there is no notion of
      // publishing in the data model, so the tab says what the data means
      // (AC-20).
      recentlyAdded: await Promise.all(
        newestVisible(live, FREE_CONTENT_LIST_SIZE, true).map(dashboardItem)
      ),
    };
  },
});

// ── The member's catalogue (AC-13 to AC-17, AC-19) ────────────────────────

/**
 * One item as a member sees it.
 *
 * Deliberately narrower than {@link teamItem}: no `quantityOnHand`, no
 * `fileKey`, no `createdBy`. A member is told WHETHER something is out of
 * stock and never how many there are, so the Library's stock position stays
 * internal; and the file key never leaves the server, because a key is all
 * anyone needs to ask `uploads.getFileUrl` to sign it.
 */
async function memberItem(ctx: QueryCtx, item: Doc<"libraryItems">) {
  const category = await ctx.db.get(item.categoryId);
  const free = isDigitalLibraryFormat(item.format);
  return {
    _id: item._id,
    title: item.title,
    author: item.author ?? null,
    categoryId: item.categoryId,
    // Hidden categories included on purpose: an item filed under a category
    // that was later retired keeps showing that category's name rather than
    // reading as uncategorised (AC-12).
    categoryName: category?.name ?? null,
    coverImageUrl: await resolveMediaUrl(item.coverImageUrl),
    format: item.format,
    itemType: item.itemType,
    free,
    priceUgx: free ? null : (item.priceUgx ?? null),
    outOfStock: item.format === "physical" && (item.quantityOnHand ?? 0) === 0,
    fileSizeBytes: free ? (item.fileSizeBytes ?? null) : null,
    audioDurationSeconds: item.audioDurationSeconds ?? null,
    createdAt: item.createdAt,
  };
}

/**
 * Everything the Library carries that is neither hidden nor removed.
 *
 * The WHOLE visible list, every time, because the screen's search and filters
 * run on the client: at tens or low hundreds of items that is one cheap read
 * and instant filtering, and past roughly a thousand it becomes a real payload
 * — at which point the fix is a Convex search index and pagination, which this
 * spec deliberately did not build.
 */
export const listCatalogue = query({
  args: {},
  handler: async (ctx) => {
    // A session and nothing more (F3-08): church content requires sign-in on
    // every query, and a visitor browses the catalogue exactly as a member
    // does.
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const rows = await ctx.db
      .query("libraryItems")
      .withIndex("by_visibility", (q) =>
        q.eq("deletedAt", undefined).eq("hidden", false)
      )
      .collect();

    return await Promise.all(
      rows.sort(newestFirst).map((item) => memberItem(ctx, item))
    );
  },
});

/** The categories the member's filter chips offer: visible ones, in order. */
export const listCatalogueCategories = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const rows = await ctx.db
      .query("libraryCategories")
      .withIndex("by_order")
      .collect();
    return rows
      .filter((row) => !row.hidden)
      .map((row) => ({ _id: row._id, name: row.name }));
  },
});

export const getCatalogueItem = query({
  // A STRING, not an id. A deep link's id arrives from a notification payload
  // or a pasted URL, and `v.id()` would throw an argument validation error on
  // a malformed one before the handler ran — which the screen can only render
  // as a crash. `normalizeId` turns the same input into a null it can render
  // as "no longer available" (AC-17).
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const id = ctx.db.normalizeId("libraryItems", itemId);
    if (!id) return null;

    const item = await ctx.db.get(id);
    // Hidden and removed both resolve to null, so a member cannot reach either
    // by guessing or keeping an id.
    if (!item || item.deletedAt !== undefined || item.hidden) return null;

    const department = await libraryDepartment(ctx);
    const contactPhone = department?.contactPhone ?? null;

    return {
      ...(await memberItem(ctx, item)),
      description: item.description ?? null,
      detailLines: item.detailLines ?? [],
      // The desk's number reaches the client ONLY here. A list card has no use
      // for it, and sending it with every row would put it in a payload forty
      // times over for one screen that needs it once (AC-15).
      contactPhone,
    };
  },
});

/**
 * The item's file key, for the one-shot URL action below.
 *
 * Internal, and it re-checks visibility itself rather than trusting the
 * generic resolver. `uploads.getFileUrl` will sign any key any signed-in
 * session can name, so the Library path fails closed on its own: a hidden or
 * removed item has no signable file as far as this feature is concerned.
 */
export const getItemFileForUrl = internalQuery({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    await requireUser(ctx);
    const id = ctx.db.normalizeId("libraryItems", itemId);
    if (!id) return null;

    const item = await ctx.db.get(id);
    if (!item || item.deletedAt !== undefined || item.hidden) return null;
    if (!item.fileKey) return null;
    return { fileKey: item.fileKey, fileContentType: item.fileContentType ?? null };
  },
});

/**
 * A signed URL for a free item's file, valid for one hour (AC-21).
 *
 * An ACTION, called when the member taps, rather than a field on the item
 * query — and that is the whole design. A reactive query re-runs whenever its
 * row changes, so a URL delivered that way would be re-signed underneath a
 * playing file the moment another operator edited the item's description,
 * restarting the audio or breaking an open PDF sheet. A one-shot action
 * produces the URL once and nothing re-runs it.
 *
 * The URL is never persisted: not on the document, not in client state. It
 * lives as long as the sheet or the player that is using it.
 */
export const getItemFileUrl = action({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }): Promise<{ url: string } | null> => {
    const file = await ctx.runQuery(internal.library.getItemFileForUrl, {
      itemId,
    });
    if (!file) return null;

    const url = await r2.getUrl(file.fileKey, {
      expiresIn: LIBRARY_FILE_URL_TTL_SECONDS,
    });
    return { url };
  },
});
