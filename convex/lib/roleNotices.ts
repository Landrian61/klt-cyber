import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { ROLE_COPY } from "@klt-cyber/shared";
import { notificationCommon } from "./reminders";
import { logActivity } from "./authz";

// The notices a role assignment causes (spec 0013). Kept out of convex/roles.ts
// so every writer that appoints or ends a role sends the same notice to the
// same people, rather than each hand writing its own copy and audience.

type Ctx = QueryCtx | MutationCtx;

/** How a person is named in a notice: first and last name, else their email. */
export function displayName(user: Pick<Doc<"users">, "firstName" | "lastName" | "email">) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

/** The department or clan an assignment is scoped to, by name, if it has one. */
export async function roleScopeName(
  ctx: Ctx,
  assignment: Pick<Doc<"roleAssignments">, "departmentId" | "clanId">
): Promise<string | undefined> {
  if (assignment.departmentId) return (await ctx.db.get(assignment.departmentId))?.name;
  if (assignment.clanId) return (await ctx.db.get(assignment.clanId))?.name;
  return undefined;
}

/**
 * The `active` assignment identical to the one being requested, if the person
 * already holds it (spec 0013, AC-4): same person, same role, same department
 * or clan. Appointing someone to a seat they already sit in is a no op, so the
 * caller returns this row instead of revoking it and inserting a copy.
 */
export async function findIdenticalActiveAssignment(
  ctx: Ctx,
  args: {
    userId: Id<"users">;
    roleType: Doc<"roleAssignments">["roleType"];
    departmentId?: Id<"departments">;
    clanId?: Id<"clans">;
  }
): Promise<Doc<"roleAssignments"> | null> {
  const active = await ctx.db
    .query("roleAssignments")
    .withIndex("by_userId_status", (q) =>
      q.eq("userId", args.userId).eq("status", "active")
    )
    .collect();
  return (
    active.find(
      (row) =>
        row.roleType === args.roleType &&
        row.departmentId === args.departmentId &&
        row.clanId === args.clanId
    ) ?? null
  );
}

/**
 * Who hears that a group has a new leader (N14, spec 0013 AC-2).
 *
 * A department's `active` roster rows whose profile is verified, or a clan's
 * verified members, in both cases minus the appointee and deleted accounts.
 * The same verified rule the `department` and `clan` push audiences apply
 * (convex/notifications.ts), but resolved here into a frozen `users` list
 * rather than sent as a live audience: the notice is about a moment, so it goes
 * to the people who were in the group at that moment (invariant 5), and someone
 * who joins an hour later is never shown it.
 *
 * An unscoped role (System Admin) leads no group, so it has no audience.
 */
export async function resolveNewLeaderRecipientIds(
  ctx: Ctx,
  assignment: Pick<Doc<"roleAssignments">, "userId" | "departmentId" | "clanId">
): Promise<Id<"users">[]> {
  let candidateIds: Id<"users">[];
  if (assignment.departmentId) {
    const departmentId = assignment.departmentId;
    const memberships = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_departmentId_status", (q) =>
        q.eq("departmentId", departmentId).eq("status", "active")
      )
      .collect();
    const verified = await Promise.all(
      [...new Set(memberships.map((m) => m.userId))].map(async (userId) => {
        const profile = await ctx.db
          .query("memberProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .unique();
        return profile?.profileStatus === "verified" ? userId : null;
      })
    );
    candidateIds = verified.filter((id): id is Id<"users"> => id !== null);
  } else if (assignment.clanId) {
    const clanId = assignment.clanId;
    const profiles = await ctx.db
      .query("memberProfiles")
      .withIndex("by_clanId_profileStatus", (q) =>
        q.eq("clanId", clanId).eq("profileStatus", "verified")
      )
      .collect();
    candidateIds = [...new Set(profiles.map((p) => p.userId))];
  } else {
    return [];
  }

  const users = await Promise.all(
    candidateIds
      .filter((id) => id !== assignment.userId)
      .map((id) => ctx.db.get(id))
  );
  return users
    .filter((u): u is Doc<"users"> => u !== null && u.deletedAt === undefined)
    .map((u) => u._id);
}

/**
 * The two notices an appointment sends (spec 0013, AC-1, AC-2, AC-17).
 *
 * N13 goes to the appointee alone, never to everyone (AC-3). For a scoped role,
 * N14 then goes to the frozen group list above, and is skipped entirely when
 * that list is empty, so no row is written for a notice nobody receives.
 *
 * Scheduled, not dispatched inline: like every notice, these are a best effort
 * side effect of the appointment, not part of its transaction.
 */
export async function notifyAppointment(
  ctx: MutationCtx,
  assignment: Doc<"roleAssignments">,
  actorId: Id<"users">
) {
  const appointee = await ctx.db.get(assignment.userId);
  if (!appointee) return;

  const roleLabel = ROLE_COPY[assignment.roleType].label;
  const scopeName = await roleScopeName(ctx, assignment);
  const roleWithScope = scopeName ? `${roleLabel} for ${scopeName}` : roleLabel;

  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title: `You are now the ${roleWithScope}`,
    body: "Open this to see what the role involves and how to reach the web portal.",
    ...notificationCommon({
      audience: { type: "users", userIds: [assignment.userId] },
      deepLink: { type: "role_assignment", id: assignment._id },
      createdBy: actorId,
      kind: "N13",
    }),
  });

  const recipients = await resolveNewLeaderRecipientIds(ctx, assignment);
  if (recipients.length === 0) return;

  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title: `New ${roleWithScope}`,
    body: `${displayName(appointee)} is now the ${roleWithScope}.`,
    ...notificationCommon({
      audience: { type: "users", userIds: recipients },
      deepLink: { type: "new_leader", id: assignment._id },
      createdBy: actorId,
      kind: "N14",
    }),
  });
}

/**
 * Why a role ended, as recorded on its `role.revoked` audit entry. These are
 * the values the revoke paths already wrote before spec 0013; a plain revoke
 * from the portal records none.
 */
export type RoleEndReason =
  | "replaced_clan_elder"
  | "replaced_department_hod"
  | "replaced_person_hod"
  | "roster_removal";

/** The two reasons that mean someone else now sits in the seat. */
const REPLACEMENT_REASONS: ReadonlySet<RoleEndReason> = new Set([
  "replaced_clan_elder",
  "replaced_department_hod",
]);

/**
 * The one way an `active` role assignment becomes `revoked` (spec 0013, AC-5,
 * AC-7, invariant 2). Returns whether it ended anything.
 *
 * Re-reads the row and does nothing unless it is still `active`, rather than
 * trusting each caller to have checked, so a row handed in twice (or revoked
 * earlier in the same transaction) is never logged or notified twice.
 *
 * Notifying is the default, so a revoke path added later cannot forget the
 * person whose role it ends. Two callers opt out with `suppressNotice`: the
 * roster removal cascade, which tells the person once in its own combined N12
 * (AC-6), and account deletion, because a deleted person is never messaged.
 * The notice never names who ended the role.
 *
 * `note` sets the row's note, and `null` clears it (account deletion, since a
 * note is free text that can name a person). `revokedAt` defaults to now.
 */
export async function endRoleAssignment(
  ctx: MutationCtx,
  row: Doc<"roleAssignments">,
  options: {
    actorId: Id<"users">;
    reason?: RoleEndReason;
    note?: string | null;
    revokedAt?: number;
    suppressNotice?: boolean;
  }
): Promise<boolean> {
  const current = await ctx.db.get(row._id);
  if (!current || current.status !== "active") return false;

  await ctx.db.patch(current._id, {
    status: "revoked",
    revokedBy: options.actorId,
    revokedAt: options.revokedAt ?? Date.now(),
    ...(options.note === null
      ? { note: undefined }
      : options.note
        ? { note: options.note }
        : {}),
  });

  await logActivity(ctx, {
    actorUserId: options.actorId,
    action: "role.revoked",
    targetType: "roleAssignments",
    targetId: current._id,
    ...(current.departmentId ? { departmentId: current.departmentId } : {}),
    metadata: {
      roleType: current.roleType,
      userId: current.userId,
      ...(current.clanId ? { clanId: current.clanId } : {}),
      ...(current.departmentId ? { departmentId: current.departmentId } : {}),
      ...(options.reason ? { reason: options.reason } : {}),
    },
  });

  if (options.suppressNotice) return true;

  const roleLabel = ROLE_COPY[current.roleType].label;
  const scopeName = await roleScopeName(ctx, current);
  await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
    title: scopeName
      ? `Your role as ${roleLabel} for ${scopeName} has ended`
      : `Your role as ${roleLabel} has ended`,
    body:
      options.reason && REPLACEMENT_REASONS.has(options.reason)
        ? "Someone else now holds this role."
        : "Speak to Administration if this looks wrong.",
    ...notificationCommon({
      audience: { type: "users", userIds: [current.userId] },
      // Opens the role screen, which shows a revoked assignment as "This role
      // has ended" (AC-14).
      deepLink: { type: "role_assignment", id: current._id },
      createdBy: options.actorId,
      kind: "N15",
    }),
  });
  return true;
}
