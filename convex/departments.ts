import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { PAUSED_DEPARTMENTS } from "@klt-cyber/shared";
import { getAdministrationCallerOrNull } from "./lib/authz";
import { resolvePhotoUrlForUser } from "./lib/identity";
import { displayName } from "./lib/roleNotices";

// Fixed reference data — the 13 Areas of Service. Seeded via seed:departments.
// No mutations: not admin-created,
// not admin-edited, no deactivation. Mirrors clans.ts exactly.
export const listDepartments = query({
  args: {},
  handler: async (ctx) =>
    await ctx.db.query("departments").withIndex("by_order").collect(),
});

const PAUSED: readonly string[] = PAUSED_DEPARTMENTS;

/**
 * Every department with who leads it, for the Administration Departments page
 * (spec 0021, AC-5, SRS A3-06): the HOD (or none), the delegate count, the
 * verified roster count and the claims waiting.
 *
 * A delegate is not a leader, so a department with only delegates still shows
 * "No HOD". Paused departments come last, marked, and are never flagged.
 * `null`, never a throw, for anyone without Administration authority.
 */
export const listForAdministration = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getAdministrationCallerOrNull(ctx))) return null;

    const departments = await ctx.db
      .query("departments")
      .withIndex("by_order")
      .collect();

    const rows = await Promise.all(
      departments.map(async (department) => {
        const [roles, activeSeats, pendingSeats] = await Promise.all([
          ctx.db
            .query("roleAssignments")
            .withIndex("by_departmentId", (q) =>
              q.eq("departmentId", department._id)
            )
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect(),
          ctx.db
            .query("departmentMemberships")
            .withIndex("by_departmentId_status", (q) =>
              q.eq("departmentId", department._id).eq("status", "active")
            )
            .collect(),
          ctx.db
            .query("departmentMemberships")
            .withIndex("by_departmentId_status", (q) =>
              q.eq("departmentId", department._id).eq("status", "pending_claim")
            )
            .collect(),
        ]);

        const hodRow = roles.find((r) => r.roleType === "hod") ?? null;
        const hodUser = hodRow ? await ctx.db.get(hodRow.userId) : null;
        const hod =
          hodRow && hodUser
            ? {
                userId: hodRow.userId,
                roleAssignmentId: hodRow._id,
                name: displayName(hodUser),
                photoUrl:
                  (await resolvePhotoUrlForUser(ctx, hodRow.userId)) ?? null,
              }
            : null;

        // Distinct people, kept only where the profile is verified. Convex has
        // no unique indexes, so one person can hold two active rows.
        const seatHolders = [...new Set(activeSeats.map((m) => m.userId))];
        const verified = await Promise.all(
          seatHolders.map(async (userId: Id<"users">) => {
            const profile = await ctx.db
              .query("memberProfiles")
              .withIndex("by_userId", (q) => q.eq("userId", userId))
              .unique();
            return profile?.profileStatus === "verified";
          })
        );

        return {
          _id: department._id,
          name: department.name,
          order: department.order,
          paused: PAUSED.includes(department.name),
          hod,
          delegateCount: new Set(
            roles
              .filter((r) => r.roleType === "department_admin")
              .map((r) => r.userId)
          ).size,
          verifiedRosterCount: verified.filter(Boolean).length,
          claimsWaiting: pendingSeats.length,
        };
      })
    );

    // Paused last, each group keeping its seeded order.
    return rows.sort(
      (a, b) => Number(a.paused) - Number(b.paused) || a.order - b.order
    );
  },
});
