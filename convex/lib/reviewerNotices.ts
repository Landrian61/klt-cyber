import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { notificationCommon } from "./reminders";
import { getAdministrationDepartmentId } from "./authz";
import { displayName } from "./roleNotices";

// The notices that tell someone there is work waiting for them in the web
// portal (spec 0013, AC-8, AC-9). Kept in one place so the features that add
// more triggers (9 resubmission and late claims, 29 mentorship confirmation)
// call the same resolver rather than each choosing its own audience.

type Ctx = QueryCtx | MutationCtx;

/**
 * Who reviews a submitted profile (N04) or a mentorship confirmation (N07):
 * the Administration department's active HOD and delegates, deduplicated
 * (spec 0013, AC-8).
 *
 * When Administration has neither, the active System Admins instead, so a
 * submission is never left unseen. This deliberately differs from the access
 * check `canManageChurchAdmin` (lib/authz.ts), which always lets a System
 * Admin review: being allowed to review is not the same as being the person
 * the church expects to do it, and System Admins hear about it only when
 * nobody else would (SRS §5, N04 and N07).
 */
export async function resolveAdministrationReviewerIds(
  ctx: Ctx
): Promise<Id<"users">[]> {
  const adminDeptId = await getAdministrationDepartmentId(ctx);
  const leaders = adminDeptId
    ? await ctx.db
        .query("roleAssignments")
        .withIndex("by_departmentId", (q) => q.eq("departmentId", adminDeptId))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "active"),
            q.or(
              q.eq(q.field("roleType"), "hod"),
              q.eq(q.field("roleType"), "department_admin")
            )
          )
        )
        .collect()
    : [];
  if (leaders.length > 0) return [...new Set(leaders.map((r) => r.userId))];

  const systemAdmins = await ctx.db
    .query("roleAssignments")
    .withIndex("by_roleType", (q) => q.eq("roleType", "system_admin"))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();
  return [...new Set(systemAdmins.map((r) => r.userId))];
}

/**
 * Tells a department's active HOD that someone asked to serve there (N10,
 * spec 0013, AC-9), once the claim is something they can act on: a
 * `pending_claim` row whose claimant's profile is verified.
 *
 * Call it from whichever of the two events happens second. Today that is
 * `verifyProfile`, because profile submission is the only claim writer and
 * always writes an unverified profile. Feature 9 calls it when a verified
 * member adds a claim.
 *
 * Sends nothing when the department has no active HOD (the claim still waits
 * on the roster, AC-17), and nothing when the claimant is that HOD.
 */
export async function notifyClaimActionable(
  ctx: MutationCtx,
  membership: Doc<"departmentMemberships">,
  actorId: Id<"users">
) {
  if (membership.status !== "pending_claim") return;

  const hod = await ctx.db
    .query("roleAssignments")
    .withIndex("by_departmentId", (q) =>
      q.eq("departmentId", membership.departmentId)
    )
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "active"),
        q.eq(q.field("roleType"), "hod")
      )
    )
    .first();
  if (!hod || hod.userId === membership.userId) return;

  const [claimant, department] = await Promise.all([
    ctx.db.get(membership.userId),
    ctx.db.get(membership.departmentId),
  ]);
  if (!claimant || !department) return;

  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title: `Someone asked to serve in ${department.name}`,
    body: `${displayName(claimant)} wants to join the ${department.name} roster.`,
    ...notificationCommon({
      audience: { type: "users", userIds: [hod.userId] },
      // Opens /portal-work on mobile: the claim is confirmed on the web portal.
      deepLink: { type: "department_claim", id: department._id },
      createdBy: actorId,
      kind: "N10",
    }),
  });
}
