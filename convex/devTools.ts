import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Dev-only maintenance helpers. These are `internalMutation`s — they are NOT
// part of the public API surface and can only be invoked with an admin key
// (e.g. `npx convex run`), never by a client. Safe to keep around for local
// admin bootstrapping; delete if you'd rather not ship them.

/**
 * Grant the Church Administrator role to the user with the given email by
 * inserting an active `church_admin` row in `roleAssignments`. Idempotent:
 * returns early if the user already holds an active church_admin grant.
 *
 * `assignedBy` is self-set (dev bootstrap), mirroring the pattern in
 * contentSeed / churchAdminSeed. The public `roles.assignRole` mutation
 * intentionally does not expose church_admin, so this is the scripted path.
 *
 * Run: npx convex run devTools:grantChurchAdminByEmail '{"email":"user@example.com"}'
 */
export const grantChurchAdminByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) {
      return { ok: false as const, reason: `no user found with email ${email}` };
    }

    const active = await ctx.db
      .query("roleAssignments")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .collect();
    if (active.some((row) => row.roleType === "church_admin")) {
      return {
        ok: true as const,
        alreadyGranted: true,
        userId: user._id,
        email,
      };
    }

    const roleAssignmentId = await ctx.db.insert("roleAssignments", {
      userId: user._id,
      roleType: "church_admin",
      assignedBy: user._id, // self-bootstrap (dev)
      status: "active",
      note: "Granted via devTools:grantChurchAdminByEmail",
    });

    return {
      ok: true as const,
      granted: true,
      userId: user._id,
      email,
      roleAssignmentId,
    };
  },
});
