import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { HOD_NOTICE_MAX_LENGTH } from "@klt-cyber/shared";
import {
  getActiveRoles,
  getCurrentUser,
  isActiveSystemAdmin,
  logActivity,
} from "./lib/authz";
import { notificationCommon } from "./lib/reminders";

/**
 * One-way word between department heads (spec 0012, F4-20, AC-31, AC-32).
 *
 * There is no reply path, by design: a notice is an announcement between
 * leaders, and a conversation belongs somewhere the church actually runs one.
 *
 * Recipients are stored as DEPARTMENT ids, never user ids, so a notice follows
 * whoever holds the HOD seat rather than freezing to the person who held it the
 * day it was sent. The cost is stated plainly in the spec: a notice to a
 * department with no current HOD reaches nobody and waits unread until one is
 * appointed.
 */

/** How many notices one page of either list returns. */
const NOTICE_PAGE_SIZE = 20;

/**
 * Who may send a notice: any department's HOD, and a System Admin.
 *
 * F4-20 and PS4-01 name the Pastoral HOD and the System Admin explicitly; the
 * Pastoral HOD is simply an HOD, identified by holding an active `hod` role
 * scoped to the department named "Pastoral", so no separate case is needed.
 * Returns the sender's own department when they have one, which is what the
 * notice is signed with — absent for a System Admin, who holds no seat.
 */
async function requireNoticeSender(ctx: MutationCtx): Promise<{
  actor: Doc<"users">;
  fromDepartmentId: Id<"departments"> | undefined;
}> {
  const actor = await getCurrentUser(ctx);
  if (!actor) throw new Error("Not authenticated");

  const roles = await getActiveRoles(ctx, actor._id);
  const hodRole = roles.find((r) => r.roleType === "hod" && r.departmentId);
  if (hodRole?.departmentId) {
    return { actor, fromDepartmentId: hodRole.departmentId };
  }
  if (await isActiveSystemAdmin(ctx, actor._id)) {
    return { actor, fromDepartmentId: undefined };
  }
  throw new Error("Only a department head or a System Admin can send a notice");
}

/** The departments whose HOD seat the caller currently holds. */
async function myHodDepartmentIds(
  ctx: QueryCtx,
  userId: Id<"users">
): Promise<Id<"departments">[]> {
  const roles = await getActiveRoles(ctx, userId);
  return roles
    .filter((r) => r.roleType === "hod" && r.departmentId)
    .map((r) => r.departmentId as Id<"departments">);
}

/** Everyone currently holding the HOD seat of one of these departments. */
async function hodUserIdsFor(
  ctx: MutationCtx,
  departmentIds: Id<"departments">[]
): Promise<Id<"users">[]> {
  const perDepartment = await Promise.all(
    departmentIds.map(async (departmentId) =>
      (
        await ctx.db
          .query("roleAssignments")
          .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
          .filter((q) =>
            q.and(
              q.eq(q.field("status"), "active"),
              q.eq(q.field("roleType"), "hod")
            )
          )
          .collect()
      ).map((r) => r.userId)
    )
  );
  return [...new Set(perDepartment.flat())];
}

export const sendNotice = mutation({
  args: {
    body: v.string(),
    scope: v.union(v.literal("all"), v.literal("selected")),
    recipientDepartmentIds: v.array(v.id("departments")),
  },
  handler: async (ctx, { body, scope, recipientDepartmentIds }) => {
    const { actor, fromDepartmentId } = await requireNoticeSender(ctx);

    const trimmed = body.trim();
    if (trimmed === "") throw new Error("A notice needs something in it");
    if (trimmed.length > HOD_NOTICE_MAX_LENGTH) {
      throw new Error(
        `A notice can be at most ${HOD_NOTICE_MAX_LENGTH} characters`
      );
    }

    const recipients =
      scope === "all" ? [] : [...new Set(recipientDepartmentIds)];
    if (scope === "selected" && recipients.length === 0) {
      throw new Error("Choose at least one department to send this to");
    }

    const sentAt = Date.now();
    const noticeId = await ctx.db.insert("hodNotices", {
      fromUserId: actor._id,
      ...(fromDepartmentId ? { fromDepartmentId } : {}),
      body: trimmed,
      scope,
      recipientDepartmentIds: recipients,
      sentAt,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "hodNotice.sent",
      targetType: "hodNotices",
      targetId: noticeId,
      // The sender's own department, so this shows in their department's
      // history. Deliberately not the recipients': a notice sent TO a
      // department is not that department's own action.
      ...(fromDepartmentId ? { departmentId: fromDepartmentId } : {}),
      metadata: { scope, recipientCount: recipients.length },
    });

    // Resolved to whoever holds the seats right now. A notice to all goes to
    // every department's current HOD, the sender included only if they happen
    // to be one — which is harmless and simpler than carving them out.
    const targetDepartmentIds =
      scope === "all"
        ? (await ctx.db.query("departments").withIndex("by_order").collect()).map(
            (d) => d._id
          )
        : recipients;
    const userIds = await hodUserIdsFor(ctx, targetDepartmentIds);

    // N25. Nobody holding a relevant seat means nobody to tell; the notice
    // still exists and will be read when someone is appointed.
    if (userIds.length > 0) {
      const senderDepartment = fromDepartmentId
        ? await ctx.db.get(fromDepartmentId)
        : null;
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        title: senderDepartment
          ? `Notice from ${senderDepartment.name}`
          : "Notice from the church office",
        body: trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed,
        ...notificationCommon({
          audience: { type: "users", userIds },
          // No mobile screen owns an HOD notice — it is a portal concern — so
          // this falls through to Home there, which is the documented
          // behaviour for an unrecognised type.
          deepLink: { type: "hod_notice", id: noticeId },
          createdBy: actor._id,
        }),
      });
    }

    return { noticeId };
  },
});

/** Sender name and department for a list of notices, each read once. */
async function decorate(ctx: QueryCtx, rows: Doc<"hodNotices">[]) {
  const departments = await ctx.db.query("departments").withIndex("by_order").collect();
  const nameById = new Map(departments.map((d) => [d._id, d.name]));

  const senderNames = new Map<Id<"users">, string>();
  for (const row of rows) {
    if (senderNames.has(row.fromUserId)) continue;
    const user = await ctx.db.get(row.fromUserId);
    const name = user
      ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
      : "";
    // An anonymised account reads as a former member rather than as a blank,
    // the same wording the message list uses.
    senderNames.set(row.fromUserId, name === "" ? "A former member" : name);
  }

  return rows.map((row) => ({
    _id: row._id,
    body: row.body,
    sentAt: row.sentAt,
    scope: row.scope,
    senderName: senderNames.get(row.fromUserId) ?? "A former member",
    senderDepartment: row.fromDepartmentId
      ? nameById.get(row.fromDepartmentId) ?? null
      : null,
    recipientNames:
      row.scope === "all"
        ? ["Every department"]
        : row.recipientDepartmentIds.map((id) => nameById.get(id) ?? "—"),
  }));
}

/**
 * The notices addressed to the caller's own HOD seats (AC-32).
 *
 * Evaluated at read time over the table, newest first, with no time window: a
 * notice is still readable long after it was sent. The membership test is "does
 * this notice name a department I currently head, or is it addressed to all",
 * which is why the table stores departments rather than people.
 *
 * Read then filter, because the index is on `sentAt` and the match depends on
 * the caller. The table is small — a handful of notices a month across the
 * church — and the page is capped, so this stays a bounded read.
 */
export const listReceived = query({
  args: { before: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { before, limit }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const myDepartmentIds = await myHodDepartmentIds(ctx, user._id);
    const isSystemAdmin = await isActiveSystemAdmin(ctx, user._id);
    if (myDepartmentIds.length === 0 && !isSystemAdmin) {
      throw new Error("Only a department head or a System Admin reads notices");
    }

    const page = Math.min(limit ?? NOTICE_PAGE_SIZE, NOTICE_PAGE_SIZE);
    const mine = new Set(myDepartmentIds);

    const rows = await ctx.db
      .query("hodNotices")
      .withIndex("by_sentAt", (q) =>
        before === undefined ? q : q.lt("sentAt", before)
      )
      .order("desc")
      .take(page * 4);

    const matching = rows.filter(
      (row) =>
        row.scope === "all" ||
        row.recipientDepartmentIds.some((id) => mine.has(id)) ||
        // A System Admin oversees the channel, so they see what goes through
        // it. They hold no seat, so nothing else would ever match for them.
        isSystemAdmin
    );
    const items = matching.slice(0, page);

    return {
      notices: await decorate(ctx, items),
      nextBefore:
        matching.length > page ? items[items.length - 1]?.sentAt ?? null : null,
    };
  },
});

/** The notices the caller has sent, newest first (AC-32). */
export const listSent = query({
  args: { before: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { before, limit }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const page = Math.min(limit ?? NOTICE_PAGE_SIZE, NOTICE_PAGE_SIZE);

    const rows = await ctx.db
      .query("hodNotices")
      .withIndex("by_from", (q) => q.eq("fromUserId", user._id))
      .order("desc")
      .take(page + 1);

    const items = (
      before === undefined ? rows : rows.filter((r) => r.sentAt < before)
    ).slice(0, page);

    return {
      notices: await decorate(ctx, items),
      nextBefore:
        rows.length > page ? items[items.length - 1]?.sentAt ?? null : null,
    };
  },
});

/** Which departments a notice may be addressed to, for the compose form. */
export const listNoticeRecipients = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const myDepartmentIds = await myHodDepartmentIds(ctx, user._id);
    const isSystemAdmin = await isActiveSystemAdmin(ctx, user._id);
    if (myDepartmentIds.length === 0 && !isSystemAdmin) return null;

    const departments = await ctx.db
      .query("departments")
      .withIndex("by_order")
      .collect();
    const mine = new Set(myDepartmentIds);

    return departments
      .filter((d) => !mine.has(d._id))
      .map((d) => ({ _id: d._id, name: d.name }));
  },
});
