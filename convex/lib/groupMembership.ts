import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Which groups a caller may read content from (spec 0010, AC-3).
 *
 * One helper for both member-facing read paths — My groups
 * (`convex/groups.ts`) and the merged upcoming list (`convex/upcoming.ts`) —
 * because the two must agree exactly. A member who sees a department's
 * messages and not its activities, or the reverse, is a bug that only shows up
 * on one screen.
 *
 * THE IN-APP READ RULE IS DELIBERATELY WIDER THAN THE PUSH RULE. Here, an
 * active roster row grants a department whatever the member's own profile
 * status is: someone added to the Ushers roster can read what Ushers is told,
 * even while their profile is still pending verification. The push audiences
 * (`resolveClanAudience` and `resolveDepartmentAudience` in
 * convex/notifications.ts) keep F4-17's and N27's verified-only rule. Any
 * future code that treats the two as one rule is wrong.
 */
export interface EligibleGroups {
  /** Distinct departments with an active roster row for this caller. */
  departmentIds: Id<"departments">[];
  /** The caller's clan, but only once their profile is verified. */
  clanId: Id<"clans"> | null;
}

/**
 * Resolves the caller's eligible groups, evaluated live against membership.
 *
 * Nothing is copied per recipient, which is what makes AC-4 true with no extra
 * state: a member removed from a department stops seeing its content on the
 * very next read, and a message does not have to be retracted from anywhere.
 */
export async function getEligibleGroups(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<EligibleGroups> {
  const memberships = await ctx.db
    .query("departmentMemberships")
    .withIndex("by_userId_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .collect();

  // Deduped on purpose. Convex has no unique indexes, so a member who was
  // removed from a department and later added back holds two active rows, and
  // a naive read would list that group twice — two headings in My groups, and
  // every one of its activities twice in the merged list.
  const departmentIds = [...new Set(memberships.map((m) => m.departmentId))];

  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  // A clan grants nothing until the profile is verified: `clanId` is
  // self-selected in the profile wizard, so an unverified row is a claim to a
  // clan rather than membership of one. A department roster row, by contrast,
  // was written by someone with authority, which is why the two differ.
  const clanId =
    profile?.profileStatus === "verified" ? (profile.clanId ?? null) : null;

  return { departmentIds, clanId };
}

/** True when the caller may read content owned by this group. */
export function isEligibleOwner(
  groups: EligibleGroups,
  owner: { type: "department"; departmentId: Id<"departments"> } | { type: "clan"; clanId: Id<"clans"> }
): boolean {
  return owner.type === "department"
    ? groups.departmentIds.includes(owner.departmentId)
    : groups.clanId === owner.clanId;
}
