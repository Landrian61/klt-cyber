import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * The one-live-row rule for `departmentMemberships` (spec 0012, AC-15).
 *
 * Since a membership can be `pending_claim`, a writer that checks only for an
 * active row will happily insert a second row beside a claim, and the roster
 * then shows the same person as active *and* awaiting confirmation. Three
 * writers have to respect the rule — `addDepartmentMember`, the role
 * appointment path in `roles.ts`, and `submitProfile` — so the rule lives here
 * once rather than being re-derived in each of them.
 *
 * Convex has no unique indexes, so this is enforcement by convention plus
 * serialisable mutations: two writers that both read the same pair conflict,
 * and one retries against the row the other wrote.
 */

/**
 * The row that occupies this person's seat in this department, if any: the
 * `pending_claim` or `active` row. `removed` and `declined` are terminal and
 * occupy nothing, so a person who was declined or removed may claim again.
 *
 * Reads `by_userId_status` twice rather than scanning the user's whole history,
 * because a person who has come and gone a few times accumulates terminal rows
 * that no writer cares about.
 */
export async function findLiveMembership(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  departmentId: Id<"departments">
): Promise<Doc<"departmentMemberships"> | null> {
  for (const status of ["active", "pending_claim"] as const) {
    const row = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", userId).eq("status", status)
      )
      .filter((q) => q.eq(q.field("departmentId"), departmentId))
      .first();
    if (row) return row;
  }
  return null;
}

/**
 * Every row of this person's that occupies a seat: their active memberships
 * plus the claims still awaiting a decision, in that order.
 *
 * What a reviewing admin needs (spec 0012, AC-21) and what the person's own
 * "my areas of service" view needs: both have to show a request that is still
 * waiting, which an `active`-only read silently drops.
 */
export async function findLiveMemberships(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<Doc<"departmentMemberships">[]> {
  const rows: Doc<"departmentMemberships">[] = [];
  for (const status of ["active", "pending_claim"] as const) {
    rows.push(
      ...(await ctx.db
        .query("departmentMemberships")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", userId).eq("status", status)
        )
        .collect())
    );
  }
  return rows;
}

/** That person's active memberships, the set `MAX_ACTIVE_DEPARTMENTS` caps. */
export async function listActiveMemberships(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<Doc<"departmentMemberships">[]> {
  return await ctx.db
    .query("departmentMemberships")
    .withIndex("by_userId_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .collect();
}

/**
 * Put someone on a department's roster: promote their pending claim if they
 * have one, else insert a fresh active row.
 *
 * Returns which of the two happened, so the caller can word its audit entry
 * honestly — "confirmed the claim they already made" is not the same event as
 * "added by their HOD", and a feed that called both "member added" would hide
 * the fact that the person had asked first.
 *
 * A row that is already `active` is returned untouched (`outcome: "existing"`).
 * Callers that treat that as an error check before calling; callers that are
 * making the person a member as a side effect of something else (appointing an
 * HOD, say) treat it as already done.
 */
export async function placeOnRoster(
  ctx: MutationCtx,
  {
    userId,
    departmentId,
    actorUserId,
    positionTitle,
  }: {
    userId: Id<"users">;
    departmentId: Id<"departments">;
    actorUserId: Id<"users">;
    positionTitle?: string;
  }
): Promise<{
  membershipId: Id<"departmentMemberships">;
  outcome: "promoted" | "inserted" | "existing";
}> {
  const live = await findLiveMembership(ctx, userId, departmentId);

  if (live?.status === "active") {
    return { membershipId: live._id, outcome: "existing" };
  }

  if (live?.status === "pending_claim") {
    await ctx.db.patch(live._id, {
      status: "active",
      decidedBy: actorUserId,
      decidedAt: Date.now(),
      // A title given at promotion time wins; without one the claim's own
      // (always absent today) stands, so promotion never clears a title.
      ...(positionTitle ? { positionTitle } : {}),
    });
    return { membershipId: live._id, outcome: "promoted" };
  }

  const membershipId = await ctx.db.insert("departmentMemberships", {
    userId,
    departmentId,
    ...(positionTitle ? { positionTitle } : {}),
    addedBy: actorUserId,
    status: "active",
  });
  return { membershipId, outcome: "inserted" };
}
