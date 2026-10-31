import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  CLAIM_DECLINE_REASON_MAX_LENGTH,
  MAX_ACTIVE_DEPARTMENTS,
  PAUSED_DEPARTMENTS,
  PROFILE_LIFECYCLE_ERRORS,
  PROFILE_LIFECYCLE_NOTICES,
  ROLE_COPY,
} from "@klt-cyber/shared";
import {
  requireUser,
  getCurrentUser,
  getAdministrationAuthorityOrNull,
  isActiveSystemAdmin,
  hasActiveDepartmentRole,
  getActiveRoles,
  getAdministrationDepartmentId,
  hasPortalAccess,
  logActivity,
  departmentCapabilities,
  requireDepartmentCapability,
  resolveDepartmentShellRole,
} from "./lib/authz";
import { resolveMediaUrl } from "./lib/media";
import {
  resolvePhotoUrl,
  resolvePhotoUrlForUser,
  touchMyProfile,
} from "./lib/identity";
import {
  assertDepartureAllowed,
  assertUnderDepartmentCap,
} from "./lib/profileLifecycle";
import { notificationCommon } from "./lib/reminders";
import {
  findLiveMembership,
  findLiveMemberships,
  listActiveMemberships,
  placeOnRoster,
} from "./lib/departmentMembership";
import { assignRoleCore, revokeRoleCore } from "./roles";
import { displayName, endRoleAssignment } from "./lib/roleNotices";

// Department roster. Membership is separate
// from `roleAssignments`: being on a department's roster doesn't imply any
// administrative authority, and holding hod/department_admin for a
// department implies roster membership (enforced in roles.ts assignRoleCore)
// but not the reverse.
//
// Since spec 0012 a person's own selection during profile submission writes a
// `pending_claim` row rather than an active one (see convex/memberProfiles.ts
// `submitProfile`): asking to serve is a request this department's HOD confirms
// or declines. A seat on a roster therefore means an authorised leader put the
// person there, which is what every department audience notification assumes.
// Rows that were already active before that change are grandfathered: they stay
// on the roster, labelled, and are excluded from the verified count.

export const addDepartmentMember = mutation({
  args: {
    departmentId: v.id("departments"),
    userId: v.id("users"),
    positionTitle: v.optional(v.string()),
  },
  handler: async (ctx, { departmentId, userId, positionTitle }) => {
    // hod, department_admin, or system_admin — read from the one capability
    // matrix, so this file enforces nothing the interface does not render from.
    const { actor } = await requireDepartmentCapability(
      ctx,
      departmentId,
      "addMember"
    );

    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile || profile.profileStatus !== "verified") {
      throw new Error("Only verified members can be added to a department roster");
    }

    const activeMemberships = await listActiveMemberships(ctx, userId);
    if (activeMemberships.some((m) => m.departmentId === departmentId)) {
      throw new Error("Already an active member of this department");
    }
    if (activeMemberships.length >= MAX_ACTIVE_DEPARTMENTS) {
      throw new Error(
        "This member already belongs to the maximum of 3 active departments"
      );
    }

    // Promotes an existing `pending_claim` row rather than inserting beside it
    // (spec 0012 AC-15): adding someone who had already asked to serve here
    // would otherwise leave them on the roster twice, once as a member and once
    // as a claimant still awaiting confirmation.
    const { membershipId, outcome } = await placeOnRoster(ctx, {
      userId,
      departmentId,
      actorUserId: actor._id,
      positionTitle,
    });
    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.member_added",
      targetType: "departmentMemberships",
      targetId: membershipId,
      departmentId,
      // `fromClaim` is what separates "the HOD added them" from "the HOD
      // effectively confirmed the claim they had already made" in the feed.
      metadata: { userId, departmentId, fromClaim: outcome === "promoted" },
    });

    // N12, to the person themself and nobody else: joining a roster is their
    // own news, not an announcement.
    const department = await ctx.db.get(departmentId);
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      title: `You are now serving in ${department?.name ?? "a new area"}`,
      body: outcome === "promoted"
        ? `Your request to serve in ${department?.name ?? "that area"} was taken up. You are on its roster.`
        : `You were added to the ${department?.name ?? "department"} roster.`,
      ...notificationCommon({
        audience: { type: "users", userIds: [userId] },
        deepLink: { type: "profile", id: userId },
        createdBy: actor._id,
      }),
    });

    return { membershipId };
  },
});

// ── The claim lifecycle (spec 0012) ─────────────────────────────────────────

/**
 * The claim an HOD is deciding on, with the two reads every decision needs.
 *
 * Both mutations below start the same way, and the order matters: the row must
 * still be pending before anything else is said about it, so a second confirm
 * of the same claim reports "no longer pending" rather than patching a row that
 * has already moved on.
 */
async function requirePendingClaim(
  ctx: MutationCtx,
  membershipId: Id<"departmentMemberships">,
  capability: "confirmClaim" | "declineClaim"
) {
  const membership = await ctx.db.get(membershipId);
  if (!membership) throw new Error("That request could not be found");

  const { actor } = await requireDepartmentCapability(
    ctx,
    membership.departmentId,
    capability
  );

  if (membership.status !== "pending_claim") {
    throw new Error("That request is no longer waiting for a decision");
  }

  const department = await ctx.db.get(membership.departmentId);
  return { membership, actor, departmentName: department?.name ?? "the department" };
}

/**
 * Confirm a claim: the person asking to serve here joins the roster
 * (spec 0012, AC-16).
 *
 * HOD (or System Admin) only; a delegate is rejected here and not merely shown
 * no button (AC-18). The validation order is the spec's, so the interface can
 * explain the refusal: still pending, then profile verified, then the three
 * department cap.
 *
 * No application lock is needed for the cap. Convex mutations are serialisable
 * over their read set, so two confirms that both read this person's active
 * memberships conflict and one retries, then fails the status check above.
 */
export const confirmClaim = mutation({
  args: { membershipId: v.id("departmentMemberships") },
  handler: async (ctx, { membershipId }) => {
    const { membership, actor, departmentName } = await requirePendingClaim(
      ctx,
      membershipId,
      "confirmClaim"
    );

    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", membership.userId))
      .unique();
    if (!profile || profile.profileStatus !== "verified") {
      throw new Error(
        "This person's member profile has not been verified yet, so they cannot " +
          "join the roster. Administration verifies profiles."
      );
    }

    const activeMemberships = await listActiveMemberships(ctx, membership.userId);
    if (activeMemberships.length >= MAX_ACTIVE_DEPARTMENTS) {
      throw new Error(
        `This person already serves in the maximum of ${MAX_ACTIVE_DEPARTMENTS} areas of service`
      );
    }

    await ctx.db.patch(membershipId, {
      status: "active",
      decidedBy: actor._id,
      decidedAt: Date.now(),
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.claim_confirmed",
      targetType: "departmentMemberships",
      targetId: membershipId,
      departmentId: membership.departmentId,
      metadata: { userId: membership.userId },
    });

    // N11. Scheduled after the write has succeeded, the same best-effort
    // convention every other notification here follows.
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      title: `Welcome to ${departmentName}`,
      body: `Your request to serve in ${departmentName} was confirmed. You are now on its roster.`,
      ...notificationCommon({
        audience: { type: "users", userIds: [membership.userId] },
        deepLink: { type: "profile", id: membership.userId },
        createdBy: actor._id,
      }),
    });

    return { ok: true as const };
  },
});

/**
 * Decline a claim, with an optional reason (spec 0012, AC-17).
 *
 * The row becomes `declined` rather than being deleted, so the department keeps
 * a readable history of who asked and what was decided. A blank or
 * whitespace-only reason stores as absent, matching how `positionTitle` and the
 * program cancellation reason already behave.
 *
 * `declineReason` goes back only to the claimant (in this notification) and to
 * that department's HOD; it is never in a roster list, since a declined row
 * appears in neither.
 */
export const declineClaim = mutation({
  args: {
    membershipId: v.id("departmentMemberships"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { membershipId, reason }) => {
    const { membership, actor, departmentName } = await requirePendingClaim(
      ctx,
      membershipId,
      "declineClaim"
    );

    const trimmed = reason?.trim();
    if (trimmed && trimmed.length > CLAIM_DECLINE_REASON_MAX_LENGTH) {
      throw new Error(
        `A reason can be at most ${CLAIM_DECLINE_REASON_MAX_LENGTH} characters`
      );
    }
    const storedReason = trimmed ? trimmed : undefined;

    await ctx.db.patch(membershipId, {
      status: "declined",
      decidedBy: actor._id,
      decidedAt: Date.now(),
      declineReason: storedReason,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.claim_declined",
      targetType: "departmentMemberships",
      targetId: membershipId,
      departmentId: membership.departmentId,
      // The reason itself stays off the audit entry: it is free text about a
      // person, readable by the claimant and their HOD, and the audit trail is
      // read by others.
      metadata: { userId: membership.userId, hadReason: storedReason !== undefined },
    });

    // N11, carrying the reason so the person is not left guessing.
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      title: `About your ${departmentName} request`,
      body: storedReason
        ? `Your request to serve in ${departmentName} was not taken up. ${storedReason}`
        : `Your request to serve in ${departmentName} was not taken up this time.`,
      ...notificationCommon({
        audience: { type: "users", userIds: [membership.userId] },
        deepLink: { type: "profile", id: membership.userId },
        createdBy: actor._id,
      }),
    });

    return { ok: true as const };
  },
});

/**
 * Change a roster member's position title, in place.
 *
 * hod (or system_admin) only — the same authority as removal, since roster
 * composition is the department head's call. Deliberately NOT
 * `requireDepartmentAuthority`: department_admin delegates can add members
 * but do not re-title them.
 *
 * This exists because the alternative was destructive. With only add and
 * remove available, "change a title" meant removeDepartmentMember followed by
 * addDepartmentMember — and removal cascade-revokes any hod/department_admin
 * role the member holds in that department (see below). Editing a title would
 * silently strip their authority, and reset `_creationTime` so the roster's
 * "Date added" column started lying.
 *
 * `positionTitle` is the whole payload and the field is optional on the row,
 * so omitting it (or passing blank) CLEARS the title rather than leaving it
 * untouched.
 */
export const updateDepartmentMembership = mutation({
  args: {
    membershipId: v.id("departmentMemberships"),
    positionTitle: v.optional(v.string()),
  },
  handler: async (ctx, { membershipId, positionTitle }) => {
    const membership = await ctx.db.get(membershipId);
    if (!membership) throw new Error("Membership not found");
    if (membership.status !== "active") {
      throw new Error("Only someone actually serving here can be given a position");
    }

    // hod or system_admin ONLY, read from the one capability matrix rather than
    // restated here, so a delegate is refused by the same table the interface
    // hides the control with (spec 0012, AC-18).
    const { actor } = await requireDepartmentCapability(
      ctx,
      membership.departmentId,
      "setPosition"
    );

    // Blank and whitespace-only both mean "no title", matching how
    // addDepartmentMember treats an empty string.
    const trimmed = positionTitle?.trim();
    const nextTitle = trimmed ? trimmed : undefined;

    // No-op edits shouldn't write an audit entry.
    if (nextTitle === membership.positionTitle) {
      return { ok: true as const, changed: false as const };
    }

    // Convex removes an optional field when patched to undefined, which is
    // how a title gets cleared.
    await ctx.db.patch(membershipId, { positionTitle: nextTitle });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.member_title_updated",
      targetType: "departmentMemberships",
      targetId: membershipId,
      departmentId: membership.departmentId,
      metadata: {
        userId: membership.userId,
        departmentId: membership.departmentId,
        from: membership.positionTitle ?? null,
        to: nextTitle ?? null,
      },
    });

    return { ok: true as const, changed: true as const };
  },
});

/**
 * End an active roster membership: the patch, the role cascade, the audit
 * entry, and optionally the notice to the person who lost the place.
 *
 * ONE removal path, two callers with different authorization and different
 * audiences (spec 0014, AC-21):
 *
 *   `removeDepartmentMember` below  — an HOD removing somebody else. Gated by
 *   `requireDepartmentCapability`, and `notifyMember: true`, because the
 *   person needs telling.
 *
 *   `leaveMyAreaOfService` — the member removing themselves. A plain member
 *   does not satisfy that capability gate, and `notifyMember: false`, because
 *   telling somebody what they just did themselves is noise.
 *
 * That is why the existing mutation could not simply be called and a helper
 * had to come out of it. The authorization stays in each mutation, where it
 * belongs; the removal itself happens in exactly one place.
 *
 * Returns the labels of any roles the removal revoked, so a caller that is
 * composing its own message can name them.
 */
async function endDepartmentMembership(
  ctx: MutationCtx,
  {
    membership,
    actorUserId,
    notifyMember,
    reason,
  }: {
    membership: Doc<"departmentMemberships">;
    actorUserId: Id<"users">;
    notifyMember: boolean;
    reason: "roster_removal" | "self_departure";
  }
): Promise<{ endedRoleLabels: string[] }> {
  await ctx.db.patch(membership._id, {
    status: "removed",
    removedBy: actorUserId,
    removedAt: Date.now(),
  });
  await logActivity(ctx, {
    actorUserId,
    action:
      reason === "self_departure"
        ? "department.member_left"
        : "department.member_removed",
    targetType: "departmentMemberships",
    targetId: membership._id,
    departmentId: membership.departmentId,
    metadata: {
      userId: membership.userId,
      departmentId: membership.departmentId,
      ...(reason === "self_departure" ? { selfService: true } : {}),
    },
  });

  // Cascade: revoke any hod/department_admin role they held in this specific
  // department. For a self departure this is belt and braces — the caller
  // blocks a departure by a role holder before getting here — but the helper
  // must not depend on which caller it is serving.
  const roleRows = await ctx.db
    .query("roleAssignments")
    .withIndex("by_departmentId", (q) =>
      q.eq("departmentId", membership.departmentId)
    )
    .filter((q) =>
      q.and(
        q.eq(q.field("userId"), membership.userId),
        q.eq(q.field("status"), "active")
      )
    )
    .collect();
  // Each ended role is silent here (`suppressNotice`): the N12 below names
  // them, so the person hears about losing the place and the roles once, not
  // once per row (spec 0013, AC-6).
  const endedRoleLabels: string[] = [];
  for (const role of roleRows) {
    const ended = await endRoleAssignment(ctx, role, {
      actorId: actorUserId,
      reason: "roster_removal",
      note:
        reason === "self_departure"
          ? "Revoked when the member left the roster"
          : "Revoked via department roster removal",
      suppressNotice: true,
    });
    if (ended) endedRoleLabels.push(ROLE_COPY[role.roleType].label);
  }

  if (notifyMember) {
    // N12, privately to the person who was removed (spec 0012, AC-20). Not an
    // announcement: leaving a roster is nobody else's business.
    const department = await ctx.db.get(membership.departmentId);
    const departmentName = department?.name ?? "department";
    const rolesLine =
      endedRoleLabels.length > 0
        ? ` Your role as ${endedRoleLabels.join(" and ")} there has ended too.`
        : "";
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      title: `Your ${departmentName} roster place has ended`,
      body: `You are no longer on the ${departmentName} roster.${rolesLine} Speak to its head if this looks wrong.`,
      ...notificationCommon({
        audience: { type: "users", userIds: [membership.userId] },
        deepLink: { type: "profile", id: membership.userId },
        createdBy: actorUserId,
        kind: "N12",
      }),
    });
  }

  return { endedRoleLabels };
}

export const removeDepartmentMember = mutation({
  args: { membershipId: v.id("departmentMemberships") },
  handler: async (ctx, { membershipId }) => {
    const membership = await ctx.db.get(membershipId);
    if (!membership) throw new Error("Membership not found");

    // hod or system_admin ONLY, from the same matrix as every other shell
    // action (AC-18).
    const { actor } = await requireDepartmentCapability(
      ctx,
      membership.departmentId,
      "removeMember"
    );

    // Only someone actually serving can be removed. Handed a `pending_claim`
    // row this would otherwise discard the claim, log a removal that never
    // happened and tell the person their roster place had ended when they never
    // had one; handed the same row twice it would do it all again. Declining a
    // claim is `declineClaim`, which is a different decision with its own
    // notification.
    if (membership.status !== "active") {
      throw new Error("Only someone currently serving here can be removed");
    }

    await endDepartmentMembership(ctx, {
      membership,
      actorUserId: actor._id,
      notifyMember: true,
      reason: "roster_removal",
    });

    return { ok: true as const };
  },
});

/**
 * Appoint a roster member as this department's delegate (`department_admin`),
 * per AC-20.
 *
 * Goes through the existing `roles.ts` path rather than writing a role row
 * here, so one place still owns role cardinality and the implicit roster
 * insert. This adds what the shell needs on top: the choice is restricted to
 * verified members of THIS roster (a delegate who does not serve here makes no
 * sense), and the audit entry carries `departmentId` so the appointment shows up
 * in the department's own feed.
 *
 * `assignRoleCore` already notifies the appointee — today church-wide, which
 * feature 10 (notification targeting, F4-03) narrows. No second notice is sent
 * from here, which would simply reach the appointee twice.
 */
export const appointDelegate = mutation({
  args: { departmentId: v.id("departments"), userId: v.id("users") },
  handler: async (ctx, { departmentId, userId }) => {
    const { actor } = await requireDepartmentCapability(
      ctx,
      departmentId,
      "manageDelegates"
    );

    const membership = await findLiveMembership(ctx, userId, departmentId);
    if (!membership || membership.status !== "active") {
      throw new Error("A delegate has to be on this department's roster already");
    }
    const profile = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile || profile.profileStatus !== "verified") {
      throw new Error("Only a verified member can be appointed as a delegate");
    }

    const existing = await ctx.db
      .query("roleAssignments")
      .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("status"), "active"),
          q.eq(q.field("roleType"), "department_admin")
        )
      )
      .first();
    if (existing) return { roleAssignmentId: existing._id, changed: false as const };

    const { roleAssignmentId } = await assignRoleCore(ctx, {
      roleType: "department_admin",
      userId,
      departmentId,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.delegate_appointed",
      targetType: "roleAssignments",
      targetId: roleAssignmentId,
      departmentId,
      metadata: { userId },
    });

    return { roleAssignmentId, changed: true as const };
  },
});

/**
 * Stand a delegate down (AC-20). The roster place is untouched: they stop being
 * a delegate, they do not stop serving.
 *
 * N15 comes from `revokeRoleCore`, which tells every person whose role ends
 * (spec 0013, AC-5), so nothing is sent from here: a second copy would reach
 * them twice.
 */
export const removeDelegate = mutation({
  args: { departmentId: v.id("departments"), userId: v.id("users") },
  handler: async (ctx, { departmentId, userId }) => {
    const { actor } = await requireDepartmentCapability(
      ctx,
      departmentId,
      "manageDelegates"
    );

    const assignment = await ctx.db
      .query("roleAssignments")
      .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), userId),
          q.eq(q.field("status"), "active"),
          q.eq(q.field("roleType"), "department_admin")
        )
      )
      .first();
    if (!assignment) {
      return { ok: true as const, changed: false as const };
    }

    await revokeRoleCore(ctx, { roleAssignmentId: assignment._id });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.delegate_removed",
      targetType: "roleAssignments",
      targetId: assignment._id,
      departmentId,
      metadata: { userId },
    });

    return { ok: true as const, changed: true as const };
  },
});

/**
 * Reactive roster read gate: System Admin, Administration authority, or the
 * given department's own HOD/delegate. Returns null when unauthenticated
 * (reactive teardown), throws when authenticated but unauthorized.
 */
async function getRosterReadAuthorityOrNull(
  ctx: QueryCtx,
  departmentId: Id<"departments">
) {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  if (await isActiveSystemAdmin(ctx, user._id)) return user;
  const adminDeptId = await getAdministrationDepartmentId(ctx);
  if (
    adminDeptId &&
    (await hasActiveDepartmentRole(ctx, user._id, adminDeptId, [
      "hod",
      "department_admin",
    ]))
  ) {
    return user;
  }
  if (
    await hasActiveDepartmentRole(ctx, user._id, departmentId, [
      "hod",
      "department_admin",
    ])
  ) {
    return user;
  }
  throw new Error("Not authorized to view this department's roster");
}

/**
 * Which department a roster read is about: the explicit `departmentId` when
 * one is given, otherwise the fixed "Administration" department resolved
 * server-side.
 *
 * The admin portal's own roster screens are always about Administration, but
 * the client had no way to name it without first fetching all 13 departments
 * and matching on `name` — a second, dependent round trip before the roster
 * query could even start, each hop paying the full authz gate. Resolving it
 * here collapses that to one call. Returns null when Administration has not
 * been seeded yet, matching the "reactive queries resolve rather than throw"
 * convention used across this file.
 */
async function resolveRosterDepartment(
  ctx: QueryCtx,
  departmentId?: Id<"departments">
) {
  const id = departmentId ?? (await getAdministrationDepartmentId(ctx));
  return id ? await ctx.db.get(id) : null;
}

/**
 * Active roster of a single department, plus the department itself so callers
 * don't need a separate lookup for its name. Omit `departmentId` to get the
 * Administration department's roster.
 *
 * Gated: System Admin, Administration authority, or this department's own
 * HOD/delegate.
 */
export const listDepartmentMembers = query({
  args: { departmentId: v.optional(v.id("departments")) },
  handler: async (ctx, { departmentId }) => {
    const department = await resolveRosterDepartment(ctx, departmentId);
    if (!department) return null;
    if (!(await getRosterReadAuthorityOrNull(ctx, department._id))) return null;

    const members = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_departmentId_status", (q) =>
        q.eq("departmentId", department._id).eq("status", "active")
      )
      .collect();

    return { department, members };
  },
});

/**
 * Same active roster as `listDepartmentMembers`, joined with each member's
 * profile (name, phone, photo) and the display name of whoever added them.
 * `listDepartmentMembers` returns bare membership rows only (userId, no
 * profile data) — this is what roster/roster-detail screens actually render;
 * kept as a separate query rather than changing `listDepartmentMembers`'
 * shape since other callers (e.g. the dashboard's member count) only need
 * the bare rows. Omit `departmentId` for the Administration department, same
 * as `listDepartmentMembers`. `profile` is null only if a membership row outlives its
 * profile (shouldn't happen — a profile row and its membership rows are
 * always created together, whether admin-added via `addDepartmentMember`
 * or self-added via `submitProfile` — but this is a live subscription, not
 * a transaction). Note the joined `profile.profileStatus` may be
 * `"pending_verification"`, not just `"verified"` — self-added members
 * appear on the roster before Church Admin verifies their profile.
 *
 * Gated: System Admin, Administration authority, or this department's own
 * HOD/delegate. This is the most sensitive read in the file — it joins each
 * roster row to the member's profile (name, phone, signed photo URL) and
 * their user row.
 */
export const listDepartmentMembersWithProfiles = query({
  args: { departmentId: v.optional(v.id("departments")) },
  handler: async (ctx, { departmentId }) => {
    const department = await resolveRosterDepartment(ctx, departmentId);
    if (!department) return null;
    if (!(await getRosterReadAuthorityOrNull(ctx, department._id))) return null;

    const memberships = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_departmentId_status", (q) =>
        q.eq("departmentId", department._id).eq("status", "active")
      )
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const [profile, user, addedByUser] = await Promise.all([
          ctx.db
            .query("memberProfiles")
            .withIndex("by_userId", (q) => q.eq("userId", membership.userId))
            .unique(),
          ctx.db.get(membership.userId),
          ctx.db.get(membership.addedBy),
        ]);
        return {
          membership,
          // One resolved photo for the row, preferring the profile's own
          // upload and falling back to the account picture (spec 0014, AC-14).
          // It sits beside `profile` rather than inside it because the row has
          // to render an avatar even for somebody with no profile at all, and
          // because no client reads the raw `users.profilePictureUrl` now.
          photoUrl:
            (await resolvePhotoUrl(profile?.photoUrl, user?.profilePictureUrl)) ??
            null,
          profile: profile
            ? { ...profile, photoUrl: await resolveMediaUrl(profile.photoUrl) }
            : null,
          user,
          addedByName: addedByUser
            ? `${addedByUser.firstName ?? ""} ${addedByUser.lastName ?? ""}`.trim() ||
              addedByUser.email
            : null,
        };
      })
    );

    return { department, members };
  },
});

// ── The shell's roster read (spec 0012) ─────────────────────────────────────

/**
 * How much of a department's roster the caller may see.
 *
 * `full` — this department's HOD or delegate, or a System Admin: the active
 * roster and the claims waiting on a decision.
 *
 * `administration` — Administration authority, which spec 0006 gave the active
 * roster of any department and which gains nothing here. SRS 4.7.2 grants the
 * claimants list to the HOD and delegate columns only, and a claimant's
 * verification state is information about a person that another department's
 * leaders have no need for.
 *
 * `null` — everyone else, including a plain roster member of this very
 * department, and an unauthenticated caller mid-teardown.
 */
async function rosterViewScope(
  ctx: QueryCtx,
  departmentId: Id<"departments">
): Promise<"full" | "administration" | null> {
  const user = await getCurrentUser(ctx);
  if (!user) return null;
  if (await isActiveSystemAdmin(ctx, user._id)) return "full";
  if (
    await hasActiveDepartmentRole(ctx, user._id, departmentId, [
      "hod",
      "department_admin",
    ])
  ) {
    return "full";
  }
  const adminDeptId = await getAdministrationDepartmentId(ctx);
  if (
    adminDeptId &&
    (await hasActiveDepartmentRole(ctx, user._id, adminDeptId, [
      "hod",
      "department_admin",
    ]))
  ) {
    return "administration";
  }
  return null;
}

/**
 * The department's roster as two lists: who serves, and who has asked to
 * (spec 0012, AC-10, AC-13).
 *
 * Both come from the existing `by_departmentId_status` index, so the new
 * statuses needed no new index. Mentorship status is read live from the
 * profile and never copied onto the membership row.
 *
 * Search and filter run on this list in the client: one department's roster is
 * tens of rows, so a server side search would be a round trip for nothing. The
 * filter options come back with it — clans from the `clans` table, positions
 * from the distinct titles actually present on this roster.
 */
export const listRosterWithClaims = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) => {
    const scope = await rosterViewScope(ctx, departmentId);
    if (!scope) return null;

    const department = await ctx.db.get(departmentId);
    if (!department) return null;

    // One read of this department's role rows, rather than two per roster
    // member: the roster shows who leads it and who deputises, and asking per
    // person would be a query per row on a live subscription.
    const roleRows = await ctx.db
      .query("roleAssignments")
      .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    const hodIds = new Set(
      roleRows.filter((r) => r.roleType === "hod").map((r) => r.userId)
    );
    const delegateIds = new Set(
      roleRows
        .filter((r) => r.roleType === "department_admin")
        .map((r) => r.userId)
    );

    const rowsFor = async (status: "active" | "pending_claim") =>
      await ctx.db
        .query("departmentMemberships")
        .withIndex("by_departmentId_status", (q) =>
          q.eq("departmentId", departmentId).eq("status", status)
        )
        .collect();

    const [activeRows, pendingRows] = await Promise.all([
      rowsFor("active"),
      scope === "full" ? rowsFor("pending_claim") : Promise.resolve([]),
    ]);

    const join = async (membership: Doc<"departmentMemberships">) => {
      const [profile, user] = await Promise.all([
        ctx.db
          .query("memberProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", membership.userId))
          .unique(),
        ctx.db.get(membership.userId),
      ]);
      const clan = profile?.clanId ? await ctx.db.get(profile.clanId) : null;
      return {
        membershipId: membership._id,
        userId: membership.userId,
        status: membership.status,
        positionTitle: membership.positionTitle ?? null,
        claimedAt: membership.claimedAt ?? membership._creationTime,
        since: membership._creationTime,
        // The same formula `listDepartmentMembersWithProfiles` already uses, so
        // one person does not read as two different names on two screens.
        displayName: user
          ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email
          : "A former member",
        // One resolved photo (spec 0014, AC-14): the profile's own upload
        // where there is one, else the account picture. Either value may be an
        // R2 key or an absolute URL, which is why it goes through the resolver
        // rather than straight out.
        photoUrl:
          (await resolvePhotoUrl(profile?.photoUrl, user?.profilePictureUrl)) ??
          null,
        clanName: clan?.name ?? null,
        // Read live, never hardcoded: a hardcoded mentorship value is exactly
        // the bug F2-11 records on the mobile side.
        mentorshipStatus: profile?.mentorshipStatus ?? null,
        // What separates "awaiting confirmation" from "not yet verified" on a
        // claim, and what puts the "not verified" label on a grandfathered
        // active row (AC-13, AC-33).
        profileStatus: profile?.profileStatus ?? null,
        isHod: hodIds.has(membership.userId),
        isDelegate: delegateIds.has(membership.userId),
      };
    };

    const [active, pending] = await Promise.all([
      Promise.all(activeRows.map(join)),
      Promise.all(pendingRows.map(join)),
    ]);

    // Last name then first name, so the list reads like a register. The display
    // name is a fallback chain, so sort on the user's own fields where present.
    const byName = (
      a: Awaited<ReturnType<typeof join>>,
      b: Awaited<ReturnType<typeof join>>
    ) => {
      const last = (n: string) => n.split(" ").slice(-1)[0] ?? n;
      return (
        last(a.displayName).localeCompare(last(b.displayName)) ||
        a.displayName.localeCompare(b.displayName)
      );
    };

    const clans = await ctx.db.query("clans").withIndex("by_order").collect();

    return {
      department: { _id: department._id, name: department.name },
      active: active.sort(byName),
      // Oldest claim first, so the person who has waited longest is at the top.
      // `claimedAt` falls back to `_creationTime` for a row written before the
      // field existed.
      pending: pending.sort((a, b) => a.claimedAt - b.claimedAt),
      filters: {
        clanNames: clans.map((c) => c.name),
        positions: [
          ...new Set(
            active
              .map((m) => m.positionTitle)
              .filter((t): t is string => !!t && t.trim() !== "")
          ),
        ].sort((a, b) => a.localeCompare(b)),
      },
      scope,
    };
  },
});

/**
 * Verified members an HOD or delegate may add to this roster (AC-19).
 *
 * A LOOKUP, not a directory. `memberProfiles.listVerifiedMembersWithRoles` is
 * gated to Administration authority and would hand a department head the whole
 * church, so this is its own narrow read: it needs at least two characters to
 * match on, returns a capped page, and projects four fields — the name to pick
 * from, the photo to recognise the person by, and the clan to tell two people
 * with the same name apart. Nothing else about a member leaves the server here;
 * widening this projection is a disclosure decision, not a convenience.
 *
 * Anyone with a live row in this department is already excluded, so the picker
 * cannot produce a duplicate for `addDepartmentMember` to reject.
 */
export const listAddableMembers = query({
  args: { departmentId: v.id("departments"), search: v.string() },
  handler: async (ctx, { departmentId, search }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const role = await resolveDepartmentShellRole(ctx, user._id, departmentId);
    if (!role || !departmentCapabilities(role).addMember) return null;

    const needle = search.trim().toLowerCase();
    if (needle.length < 2) return [];

    const [verified, liveHere, clans] = await Promise.all([
      ctx.db
        .query("memberProfiles")
        .withIndex("by_profileStatus", (q) => q.eq("profileStatus", "verified"))
        .collect(),
      (async () => {
        const ids = new Set<Id<"users">>();
        for (const status of ["active", "pending_claim"] as const) {
          const rows = await ctx.db
            .query("departmentMemberships")
            .withIndex("by_departmentId_status", (q) =>
              q.eq("departmentId", departmentId).eq("status", status)
            )
            .collect();
          for (const row of rows) ids.add(row.userId);
        }
        return ids;
      })(),
      ctx.db.query("clans").withIndex("by_order").collect(),
    ]);

    const clanNameById = new Map(clans.map((c) => [c._id, c.name]));

    const matches = verified
      .filter((profile) => !liveHere.has(profile.userId))
      .filter((profile) =>
        [profile.firstName, profile.middleName, profile.lastName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
      .slice(0, ADDABLE_PAGE_SIZE);

    return await Promise.all(
      matches.map(async (profile) => ({
        userId: profile.userId,
        displayName: [profile.firstName, profile.middleName, profile.lastName]
          .filter(Boolean)
          .join(" "),
        // The profile's own upload, else the account picture (spec 0014,
        // AC-14), already resolved.
        photoUrl:
          (await resolvePhotoUrlForUser(ctx, profile.userId, profile)) ?? null,
        clanName: profile.clanId ? clanNameById.get(profile.clanId) ?? null : null,
      }))
    );
  },
});

/** How many people the add-member lookup offers at once. */
const ADDABLE_PAGE_SIZE = 20;

/** The caller's own active department memberships. Null when unauthenticated. */
/**
 * The caller's own Areas of Service: confirmed seats and requests still
 * waiting, with the department named and each row's own actions worked out
 * (spec 0014, AC-19 to AC-21).
 *
 * Both LIVE statuses, not just `active`. An active-only read would hide the
 * very rows a person needs to see to withdraw a request, which is the one
 * thing they can do about a claim nobody has decided yet.
 *
 * `blockedByRole` is resolved here rather than on the client, because the rule
 * is a server rule: a member may not leave a roster they lead. Sending the
 * reason means the interface can explain instead of hiding the button, and
 * cannot disagree with what `leaveMyAreaOfService` will actually do.
 */
export const getMyDepartmentMemberships = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getCurrentUser(ctx);
    if (!actor) return null;

    const live = await findLiveMemberships(ctx, actor._id);

    const heldRoles = await ctx.db
      .query("roleAssignments")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", actor._id).eq("status", "active")
      )
      .collect();

    return await Promise.all(
      live.map(async (membership) => {
        const department = await ctx.db.get(membership.departmentId);
        const blocking = heldRoles.filter(
          (role) =>
            role.departmentId === membership.departmentId &&
            (role.roleType === "hod" || role.roleType === "department_admin")
        );
        return {
          _id: membership._id,
          departmentId: membership.departmentId,
          departmentName: department?.name ?? "An area of service",
          status: membership.status,
          since: membership.claimedAt ?? membership._creationTime,
          // The role label when one blocks a departure, else null. Named so
          // the person knows who to ask rather than retrying.
          blockedByRole:
            blocking.length > 0
              ? blocking
                  .map((role) => ROLE_COPY[role.roleType].label)
                  .join(" and ")
              : null,
        };
      })
    );
  },
});

/**
 * Active hod(s) of a department — expect at most one, per cardinality rules.
 *
 * Gated: Administration authority — system_admin, or the Administration
 * department's hod/department_admin, which is the portal-wide authority.
 * That matches every caller of the three roster reads
 * today: all of them render under `app/(admin)/admin/*`, whose layout already
 * requires exactly this. When departments get their own portals, the gate
 * will need to widen to "…or this department's own hod/department_admin" —
 * deliberately not anticipated here.
 *
 * `getAdministrationAuthorityOrNull` (not `requireAdministrationAuthority`)
 * because these are live subscriptions: on sign-out the token drops while the
 * subscription is still mounted, and the unauthenticated re-run must resolve
 * to null rather than surface as a client error. An authenticated caller
 * without the authority still throws — that is a real violation.
 *
 * NOTE: this query currently has no callers. Gated rather than deleted so the
 * whole file is consistent; removing it is a separate cleanup.
 */
export const listDepartmentHods = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) => {
    if (!(await getAdministrationAuthorityOrNull(ctx))) return null;

    return await ctx.db
      .query("roleAssignments")
      .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("roleType"), "hod")
        )
      )
      .collect();
  },
});

// ── Post-login department picker ─────────────────────────────────────────

/**
 * Departments the caller should see on the post-login picker. System Admin
 * sees all 13 (unscoped). Everyone else sees only
 * departments they're on the active roster of, or hold an active
 * hod/department_admin grant for — in practice these largely coincide, since
 * assignRoleCore already adds hod/department_admin appointees to the roster,
 * but a role and a roster row are still tracked and unioned independently
 * here in case they ever diverge (e.g. a future admin action that grants
 * authority without roster membership).
 */
export const listMyDepartments = query({
  args: {},
  handler: async (ctx) => {
    // Null (not an error) when unauthenticated — reactive clients stay
    // subscribed through sign-out, and the unauthenticated re-run must
    // resolve rather than log a crash mid-teardown.
    const actor = await getCurrentUser(ctx);
    if (!actor) return null;

    const isSystemAdmin = await isActiveSystemAdmin(ctx, actor._id);
    const allDepartments = await ctx.db
      .query("departments")
      .withIndex("by_order")
      .collect();

    if (isSystemAdmin) {
      return allDepartments.map((department) => ({
        department,
        roles: [] as string[],
        isSystemAdmin: true as const,
      }));
    }

    const [memberships, activeRoles] = await Promise.all([
      ctx.db
        .query("departmentMemberships")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", actor._id).eq("status", "active")
        )
        .collect(),
      getActiveRoles(ctx, actor._id),
    ]);

    const rolesByDept = new Map<Id<"departments">, Set<string>>();
    for (const membership of memberships) {
      const roles = rolesByDept.get(membership.departmentId) ?? new Set<string>();
      roles.add("member");
      rolesByDept.set(membership.departmentId, roles);
    }
    for (const role of activeRoles) {
      if (
        (role.roleType === "hod" || role.roleType === "department_admin") &&
        role.departmentId
      ) {
        const roles = rolesByDept.get(role.departmentId) ?? new Set<string>();
        roles.add(role.roleType);
        rolesByDept.set(role.departmentId, roles);
      }
    }

    return allDepartments
      .filter((department) => rolesByDept.has(department._id))
      .map((department) => ({
        department,
        roles: Array.from(rolesByDept.get(department._id) ?? []),
        isSystemAdmin: false as const,
      }));
  },
});

/**
 * Access check + name lookup for a single department's "coming soon" page —
 * every department other than Administration routes here today, since none
 * of them have a real portal built yet (the
 * page itself is intentionally just a skeleton, so this query intentionally
 * doesn't fetch roster/hod detail it wouldn't render).
 *
 * This is the real authorization boundary for /departments/[departmentId] —
 * it throws unless the caller is System Admin, on this department's roster,
 * or holds hod/department_admin for it specifically. The page component only
 * redirects on the resulting error; it doesn't re-derive access itself.
 */
export const getDepartmentAccess = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) => {
    const actor = await requireUser(ctx);

    if (!(await hasPortalAccess(ctx, actor._id))) {
      throw new Error("Not authorized to view this department");
    }

    const isSystemAdmin = await isActiveSystemAdmin(ctx, actor._id);
    if (!isSystemAdmin) {
      const isMember = await ctx.db
        .query("departmentMemberships")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", actor._id).eq("status", "active")
        )
        .filter((q) => q.eq(q.field("departmentId"), departmentId))
        .first();
      const hasAuthority = await hasActiveDepartmentRole(
        ctx,
        actor._id,
        departmentId,
        ["hod", "department_admin"]
      );
      if (!isMember && !hasAuthority) {
        throw new Error("Not authorized to view this department");
      }
    }

    const department = await ctx.db.get(departmentId);
    if (!department) throw new Error("Department not found");

    return { department };
  },
});

/**
 * Hub query: all departments split into active (the caller can enter) and
 * paused ("Coming soon"). System Admin sees every active department as
 * enterable. Others see only departments they serve in or hold authority for.
 * Null when unauthenticated (reactive teardown).
 */
export const listMyDepartmentsForHub = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getCurrentUser(ctx);
    if (!actor) return null;

    if (!(await hasPortalAccess(ctx, actor._id))) return null;

    const allDepartments = await ctx.db
      .query("departments")
      .withIndex("by_order")
      .collect();

    const pausedNames: readonly string[] = PAUSED_DEPARTMENTS;
    const paused = allDepartments.filter((d) => pausedNames.includes(d.name));
    const active = allDepartments.filter((d) => !pausedNames.includes(d.name));

    const sysAdmin = await isActiveSystemAdmin(ctx, actor._id);
    if (sysAdmin) {
      return {
        active: active.map((d) => ({
          department: d,
          roles: [] as string[],
          isSystemAdmin: true as const,
        })),
        paused: paused.map((d) => ({ department: d })),
      };
    }

    const [memberships, roles] = await Promise.all([
      ctx.db
        .query("departmentMemberships")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", actor._id).eq("status", "active")
        )
        .collect(),
      getActiveRoles(ctx, actor._id),
    ]);

    const rolesByDept = new Map<Id<"departments">, Set<string>>();
    for (const m of memberships) {
      const s = rolesByDept.get(m.departmentId) ?? new Set<string>();
      s.add("member");
      rolesByDept.set(m.departmentId, s);
    }
    for (const r of roles) {
      if (
        (r.roleType === "hod" || r.roleType === "department_admin") &&
        r.departmentId
      ) {
        const s = rolesByDept.get(r.departmentId) ?? new Set<string>();
        s.add(r.roleType);
        rolesByDept.set(r.departmentId, s);
      }
    }

    return {
      active: active
        .filter((d) => rolesByDept.has(d._id))
        .map((d) => ({
          department: d,
          roles: Array.from(rolesByDept.get(d._id) ?? []),
          isSystemAdmin: false as const,
        })),
      paused: paused.map((d) => ({ department: d })),
    };
  },
});

// ── Self service: a member's own Areas of Service (spec 0014, AC-19 to AC-21)
//
// A person used to pick their Areas of Service once, in the wizard, and after
// that only a leader could change them. These three hand that back:
//
//   `addMyAreaOfService`   ask to serve somewhere new
//   `withdrawMyClaim`      take that request back before it is decided
//   `leaveMyAreaOfService` step off a roster you are already on
//
// None of them is new machinery. Spec 0012 built the claim lifecycle, the live
// row helpers and the one-live-row-per-pair invariant; these are the member
// facing entry points to it. Each resolves the caller through `requireUser`
// and reads its row from the caller's own id, so there is no "whose
// membership" argument to forge.

/**
 * The department's active HOD and delegate, to tell about a roster change.
 *
 * Returns an empty list when the department has neither, and never includes
 * the person who acted: telling somebody what they just did themselves is
 * noise, and an HOD who leaves their own department would otherwise get a
 * notice about it.
 */
async function departmentLeaderIds(
  ctx: MutationCtx,
  departmentId: Id<"departments">,
  exceptUserId: Id<"users">
): Promise<Id<"users">[]> {
  const leaders = await ctx.db
    .query("roleAssignments")
    .withIndex("by_departmentId", (q) => q.eq("departmentId", departmentId))
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "active"),
        q.or(
          q.eq(q.field("roleType"), "hod"),
          q.eq(q.field("roleType"), "department_admin")
        )
      )
    )
    .collect();
  return [
    ...new Set(
      leaders.map((row) => row.userId).filter((id) => id !== exceptUserId)
    ),
  ];
}

/** The caller's own verified profile, or a coded refusal. */
async function requireMyVerifiedProfile(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<Doc<"memberProfiles">> {
  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile || profile.profileStatus !== "verified") {
    throw new ConvexError({
      code: PROFILE_LIFECYCLE_ERRORS.PROFILE_NOT_VERIFIED,
    });
  }
  return profile;
}

/**
 * A verified member asks to serve in a department (F2-07, AC-19).
 *
 * Creates exactly one `pending_claim` row and tells that department's HOD.
 * Unlike a claim made during submission, this claimant is ALREADY VERIFIED, so
 * the request is actionable immediately — spec 0013's reason for holding the
 * alert back (an unverified claimant gives the HOD nothing to act on) does not
 * apply here.
 *
 * The cap counts LIVE rows, `active` and `pending_claim` together. Counting
 * only active seats would let somebody queue ten requests and land on ten
 * rosters once each HOD said yes, with no single mutation ever seeing a
 * violation — confirmations are independent of one another.
 */
export const addMyAreaOfService = mutation({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) => {
    const user = await requireUser(ctx);
    await requireMyVerifiedProfile(ctx, user._id);

    const live = await findLiveMemberships(ctx, user._id);
    assertUnderDepartmentCap(live.length);

    const department = await ctx.db.get(departmentId);
    if (!department) throw new Error("Department not found");

    const existing = await findLiveMembership(ctx, user._id, departmentId);
    if (existing) {
      // The department is named in the data rather than only in a message, so
      // the client can say "you already serve in Hospitality" without having
      // to parse a sentence.
      throw new ConvexError({
        code: PROFILE_LIFECYCLE_ERRORS.DEPARTMENT_ALREADY_LIVE,
        departmentName: department.name,
        alreadyActive: existing.status === "active",
      });
    }

    const now = Date.now();
    const membershipId = await ctx.db.insert("departmentMemberships", {
      userId: user._id,
      departmentId,
      addedBy: user._id,
      status: "pending_claim",
      claimedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "department.claim_created",
      targetType: "departmentMemberships",
      targetId: membershipId,
      // At the top level so the claim reaches that department's own dashboard
      // feed, matching what `submitProfile` already writes.
      departmentId,
      metadata: { userId: user._id, departmentId, selfService: true },
    });

    await touchMyProfile(ctx, user._id, now);

    const leaderIds = await departmentLeaderIds(ctx, departmentId, user._id);
    if (leaderIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        ...PROFILE_LIFECYCLE_NOTICES.claimCreated(
          displayName(user),
          department.name
        ),
        ...notificationCommon({
          audience: { type: "users", userIds: leaderIds },
          deepLink: { type: "department_claim", id: departmentId },
          createdBy: user._id,
          kind: "N10",
        }),
      });
    }

    return { membershipId };
  },
});

/**
 * A member takes back a request to serve, before it has been decided (AC-20).
 *
 * Always allowed. The department's leaders are told, so a request they were
 * about to confirm does not simply vanish from their screen.
 *
 * Stored as `declined` with `decidedBy` set to the member THEMSELF, rather
 * than adding a fourth status value: spec 0012 already treats `declined` as
 * terminal, and `decidedBy` distinguishes a withdrawal from an HOD's decline
 * for anybody reading the row. If that distinction ever has to be visible in
 * an interface, that is the moment to add a status value, not now.
 */
export const withdrawMyClaim = mutation({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) => {
    const user = await requireUser(ctx);

    const live = await findLiveMembership(ctx, user._id, departmentId);
    if (!live || live.status !== "pending_claim") {
      throw new Error("You have no request waiting for this area of service");
    }

    const now = Date.now();
    await ctx.db.patch(live._id, {
      status: "declined",
      decidedBy: user._id,
      decidedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: user._id,
      action: "department.claim_withdrawn",
      targetType: "departmentMemberships",
      targetId: live._id,
      departmentId,
      metadata: { userId: user._id, departmentId, selfService: true },
    });

    await touchMyProfile(ctx, user._id, now);

    const department = await ctx.db.get(departmentId);
    const leaderIds = await departmentLeaderIds(ctx, departmentId, user._id);
    if (department && leaderIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        ...PROFILE_LIFECYCLE_NOTICES.claimWithdrawn(
          displayName(user),
          department.name
        ),
        ...notificationCommon({
          audience: { type: "users", userIds: leaderIds },
          deepLink: { type: "department_claim", id: departmentId },
          createdBy: user._id,
          kind: "N10",
        }),
      });
    }

    return { ok: true as const };
  },
});

/**
 * A member steps off a roster they are on (AC-21).
 *
 * Blocked while they hold `hod` or `department_admin` there: a department
 * cannot be left headless by the head walking off its roster. The refusal
 * NAMES the role, so the person knows who to ask instead of retrying.
 *
 * Shares `endDepartmentMembership` with `removeDepartmentMember`, so there is
 * one removal path with one role cascade and one audit shape — see that
 * helper for why the existing mutation could not simply be called.
 *
 * No confirmation step lives in the mutation: the app and the portal ask
 * first, because rejoining means a fresh claim and another wait.
 */
export const leaveMyAreaOfService = mutation({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, { departmentId }) => {
    const user = await requireUser(ctx);

    const live = await findLiveMembership(ctx, user._id, departmentId);
    if (!live || live.status !== "active") {
      throw new Error("You are not on this roster");
    }

    const heldRoles = await ctx.db
      .query("roleAssignments")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("departmentId"), departmentId),
          q.or(
            q.eq(q.field("roleType"), "hod"),
            q.eq(q.field("roleType"), "department_admin")
          )
        )
      )
      .collect();
    assertDepartureAllowed(
      heldRoles.map((role) => ROLE_COPY[role.roleType].label)
    );

    const department = await ctx.db.get(departmentId);
    // The leaders are read BEFORE the removal, because the role cascade inside
    // the helper could end a row the lookup depends on.
    const leaderIds = await departmentLeaderIds(ctx, departmentId, user._id);

    await endDepartmentMembership(ctx, {
      membership: live,
      actorUserId: user._id,
      // The person who acted already knows; a notice would be noise.
      notifyMember: false,
      reason: "self_departure",
    });

    await touchMyProfile(ctx, user._id);

    if (department && leaderIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        ...PROFILE_LIFECYCLE_NOTICES.memberLeft(
          displayName(user),
          department.name
        ),
        ...notificationCommon({
          audience: { type: "users", userIds: leaderIds },
          deepLink: { type: "department_claim", id: departmentId },
          createdBy: user._id,
          kind: "N10",
        }),
      });
    }

    return { ok: true as const };
  },
});
