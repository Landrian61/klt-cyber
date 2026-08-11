import { internalMutation, internalQuery } from "./_generated/server";

// One-time reset for the Increment 5 department restructure
// (docs/Alignment.md §7). Run manually, then `seed:departments`, then
// `verifyDepartmentReset` to confirm before deploying the rest of the
// migration. Not idempotent-safe to re-run after departments are re-seeded
// (it would wipe them again) — intended as a single use-once step.
//
// TRANSITIONAL / TYPE-CHECKING NOTE (see docs/Alignment.md's Execution
// order, and the task brief that produced this file): this script's whole
// purpose is to clean up data shapes — `roleType: "church_admin"` on
// `roleAssignments`, `departmentId` on `memberProfiles` — that the *final*
// schema (convex/schema.ts, as committed in this same source pass) no
// longer allows. Read/patched here with `as any` on exactly the
// legacy-shape references below, since the whole point of this file is to
// operate once against the pre-migration data before the schema cleanup
// (Alignment.md Execution order step 7) is what's actually deployed. Per
// Alignment.md's execution order, this script is meant to run against the
// additive-only intermediate schema state (step 1: schema deployed with
// `hod`/`department_admin`/`departmentMemberships` added but `church_admin`
// and `memberProfiles.departmentId` not yet removed) — NOT after the final
// schema cleanup has already landed. Flag this to whoever runs the actual
// deploy sequence.
export const resetDepartmentData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oldDepartments = await ctx.db.query("departments").collect();
    for (const row of oldDepartments) await ctx.db.delete(row._id);

    const profilesWithDept = await ctx.db
      .query("memberProfiles")
      // "departmentId" no longer exists on the final `memberProfiles` type —
      // this row shape only exists pre-cleanup. See top-of-file note.
      .filter((q) => q.neq(q.field("departmentId" as any), undefined))
      .collect();
    for (const row of profilesWithDept) {
      await ctx.db.patch(row._id, { departmentId: undefined } as any);
    }

    const churchAdmins = await ctx.db
      .query("roleAssignments")
      // "church_admin" is no longer a member of the final roleType union —
      // this literal only exists pre-cleanup. See top-of-file note.
      .filter((q) => q.eq(q.field("roleType"), "church_admin" as any))
      .collect();
    for (const row of churchAdmins) await ctx.db.delete(row._id);

    return {
      departmentsCleared: oldDepartments.length,
      memberProfilesCleared: profilesWithDept.length,
      churchAdminRowsDeleted: churchAdmins.length,
    };
  },
});

export const verifyDepartmentReset = internalQuery({
  args: {},
  handler: async (ctx) => {
    const departments = await ctx.db.query("departments").collect();
    const churchAdmins = await ctx.db
      .query("roleAssignments")
      .filter((q) => q.eq(q.field("roleType"), "church_admin" as any))
      .collect();
    const staleProfiles = await ctx.db
      .query("memberProfiles")
      .filter((q) => q.neq(q.field("departmentId" as any), undefined))
      .collect();
    return {
      departmentCount: departments.length, // expect 13
      hasAdministration: departments.some((d) => d.name === "Administration"), // expect true
      activeChurchAdminRows: churchAdmins.length, // expect 0
      staleMemberProfileDepartmentIds: staleProfiles.length, // expect 0
    };
  },
});
