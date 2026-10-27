import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  GROUP_MESSAGE_MAX_LENGTH,
  GROUP_MESSAGE_PAGE_SIZE,
  GROUP_MESSAGE_WINDOW_DAYS,
} from "@klt-cyber/shared";
import {
  departmentCapabilities,
  getCurrentUser,
  logActivity,
  requireDepartmentCapability,
  resolveDepartmentShellRole,
} from "./lib/authz";
import { notificationCommon } from "./lib/reminders";
import { getEligibleGroups, isEligibleOwner } from "./lib/groupMembership";
import { resolveMediaUrl } from "./lib/media";

// Member-facing reads over group content (spec 0010). Read-only, all of it:
// nothing here writes a `groupActivities` or `groupMessages` row, and no
// member can change group or cancellation state (AC-15). Features 17 and 23
// own the authoring side and write against this contract.

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a sender with no name left reads as (spec 0008 clears every name field
 * on an anonymized account, so firstName/lastName come back empty). An empty
 * string under a message would read as a bug. */
const ANONYMIZED_SENDER = "A former member";

function senderName(user: Doc<"users"> | null): string {
  if (!user) return ANONYMIZED_SENDER;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name === "" ? ANONYMIZED_SENDER : name;
}

/**
 * Resolves each sender once, however many messages they sent.
 *
 * A read per message would be a read per message from the same HOD, which is
 * the common case inside one group.
 */
async function resolveSenderNames(
  ctx: QueryCtx,
  userIds: Id<"users">[]
): Promise<Map<Id<"users">, string>> {
  const distinct = [...new Set(userIds)];
  const entries = await Promise.all(
    distinct.map(async (id) => [id, senderName(await ctx.db.get(id))] as const)
  );
  return new Map(entries);
}

/**
 * The messages addressed to the caller's own groups, grouped by group (AC-2).
 *
 * One windowed, capped read per eligible group rather than one read over every
 * message in the church: the work is bounded by how many groups this member
 * belongs to (a handful), not by how many groups exist. `groupMessages` has no
 * `sentAt` because Convex appends `_creationTime` to every index, so the index
 * equality plus a range on `_creationTime` IS the window read.
 *
 * Returns `null` when the session is not authenticated, matching every other
 * member-facing query here — a live subscription outlasts sign-out.
 */
export const listMyGroupMessages = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const groups = await getEligibleGroups(ctx, user._id);
    const windowStart = Date.now() - GROUP_MESSAGE_WINDOW_DAYS * DAY_MS;

    const sections: {
      groupId: string;
      ownerType: "department" | "clan";
      groupName: string;
      messages: {
        _id: Id<"groupMessages">;
        body: string;
        imageUrl: string | undefined;
        senderName: string;
        _creationTime: number;
      }[];
    }[] = [];

    const collect = async (
      rows: Doc<"groupMessages">[],
      groupId: string,
      ownerType: "department" | "clan",
      groupName: string
    ) => {
      // A group with nothing to say inside the window contributes no section
      // at all, so the screen never renders an empty heading (AC-2).
      if (rows.length === 0) return;

      const names = await resolveSenderNames(
        ctx,
        rows.map((r) => r.sentBy)
      );
      sections.push({
        groupId,
        ownerType,
        groupName,
        messages: await Promise.all(
          rows.map(async (r) => ({
            _id: r._id,
            body: r.body,
            imageUrl: await resolveMediaUrl(r.imageUrl),
            senderName: names.get(r.sentBy) ?? ANONYMIZED_SENDER,
            _creationTime: r._creationTime,
          }))
        ),
      });
    };

    for (const departmentId of groups.departmentIds) {
      const department = await ctx.db.get(departmentId);
      // A roster row can outlive its department. Omitted rather than shown
      // under a blank heading, which is what the spec's value sourcing calls
      // for on both read paths.
      if (!department) continue;

      const rows = await ctx.db
        .query("groupMessages")
        .withIndex("by_department", (q) =>
          q.eq("owner.departmentId", departmentId).gt("_creationTime", windowStart)
        )
        // Applied during the scan, so the cap below yields 50 live messages
        // rather than 50 rows of which some are deleted (AC-4).
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .order("desc")
        .take(GROUP_MESSAGE_PAGE_SIZE);

      await collect(rows, departmentId, "department", department.name);
    }

    if (groups.clanId) {
      const clan = await ctx.db.get(groups.clanId);
      if (clan) {
        const rows = await ctx.db
          .query("groupMessages")
          .withIndex("by_clan", (q) =>
            q.eq("owner.clanId", clan._id).gt("_creationTime", windowStart)
          )
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .order("desc")
          .take(GROUP_MESSAGE_PAGE_SIZE);

        await collect(rows, clan._id, "clan", clan.name);
      }
    }

    // Departments first, then the clan, each block by name ascending. A stable
    // order on purpose: ordering by "most recently active" would reshuffle the
    // headings under the member every time a group posted, so a member who
    // learned where their department sits would have to look for it again.
    return sections.sort((a, b) => {
      if (a.ownerType !== b.ownerType) return a.ownerType === "department" ? -1 : 1;
      return a.groupName.localeCompare(b.groupName);
    });
  },
});

// ── The department shell's authoring side (spec 0012) ───────────────────────
// The reads above are the member's. These three are the department leader's:
// sending to the whole department, reading back what has been sent, and taking
// one down. They live here rather than in a new file so the message's read and
// write paths stay in each other's sight — the "a former member" fallback, for
// instance, has to read the same either way.

/**
 * Message the whole department (spec 0012, AC-28).
 *
 * HOD or delegate. Verified roster members get push and in-app delivery (N24)
 * and the message appears under "My groups" in the app, which spec 0010 already
 * built — this is the authoring side of that contract and needs no mobile
 * change.
 */
export const sendDepartmentMessage = mutation({
  args: {
    departmentId: v.id("departments"),
    body: v.string(),
    imageKey: v.optional(v.string()),
  },
  handler: async (ctx, { departmentId, body, imageKey }) => {
    const { actor } = await requireDepartmentCapability(
      ctx,
      departmentId,
      "sendMessage"
    );

    const trimmed = body.trim();
    if (trimmed === "") throw new Error("A message needs something in it");
    if (trimmed.length > GROUP_MESSAGE_MAX_LENGTH) {
      throw new Error(
        `A message can be at most ${GROUP_MESSAGE_MAX_LENGTH} characters`
      );
    }

    const messageId = await ctx.db.insert("groupMessages", {
      body: trimmed,
      ...(imageKey ? { imageUrl: imageKey } : {}),
      owner: { type: "department", departmentId },
      sentBy: actor._id,
    });

    const department = await ctx.db.get(departmentId);

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.message_sent",
      targetType: "groupMessages",
      targetId: messageId,
      departmentId,
      // The body stays off the audit entry: it is the message's own content,
      // read in the message list by the people it was addressed to.
      metadata: { length: trimmed.length, hasImage: imageKey !== undefined },
    });

    // N24. The `department` audience resolves to verified roster members only,
    // so a pending claimant is never included (AC-23, AC-28).
    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      title: `${department?.name ?? "Your department"}`,
      body: trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed,
      ...notificationCommon({
        audience: { type: "department", departmentId },
        // "groupMessage", exactly as apps/mobile/lib/notification-links.ts
        // spells it: a message has no detail screen, so the tap lands on the
        // Updates tab where My groups holds it.
        deepLink: { type: "groupMessage", id: messageId },
        createdBy: actor._id,
        imageUrl: imageKey,
      }),
    });

    return { messageId };
  },
});

/**
 * What this department has been told, newest first (AC-29).
 *
 * Paginated with an explicit `before` cursor on `_creationTime` rather than
 * Convex's paginated-query helper, because the portal renders one "show older"
 * button rather than an infinite list, and a plain cursor keeps this a normal
 * live query the rest of the portal's reads already look like. Deliberately NOT
 * windowed the way the member's own "My groups" read is: a leader looking back
 * over the year should find what they sent in January.
 */
export const listDepartmentMessages = query({
  args: {
    departmentId: v.id("departments"),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { departmentId, before, limit }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const role = await resolveDepartmentShellRole(ctx, user._id, departmentId);
    if (!role || !departmentCapabilities(role).viewMessages) return null;

    const page = Math.min(limit ?? GROUP_MESSAGE_PAGE_SIZE, GROUP_MESSAGE_PAGE_SIZE);

    const rows = await ctx.db
      .query("groupMessages")
      .withIndex("by_department", (q) =>
        before === undefined
          ? q.eq("owner.departmentId", departmentId)
          : q.eq("owner.departmentId", departmentId).lt("_creationTime", before)
      )
      // A soft-deleted message keeps its audit trail but leaves every list.
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .take(page + 1);

    const items = rows.slice(0, page);
    const names = await resolveSenderNames(ctx, items.map((r) => r.sentBy));

    return {
      messages: await Promise.all(
        items.map(async (r) => ({
          _id: r._id,
          body: r.body,
          imageUrl: await resolveMediaUrl(r.imageUrl),
          sentAt: r._creationTime,
          senderName: names.get(r.sentBy) ?? ANONYMIZED_SENDER,
          // Which delete control to show: an HOD may take down anything, a
          // delegate only their own (AC-30). The mutation re-checks.
          sentByMe: r.sentBy === user._id,
        }))
      ),
      // Absent when there is nothing older, so the portal knows whether to
      // render "show older" at all.
      nextBefore:
        rows.length > page ? items[items.length - 1]?._creationTime ?? null : null,
    };
  },
});

/**
 * Take a message down (AC-30).
 *
 * A soft delete: the row stays, so S5-03's audit trail survives, and the
 * message leaves "My groups" and every list on the next read because both
 * filter on `deletedAt`.
 *
 * An HOD may delete any message in their department; a delegate only the ones
 * they sent. That split is the reason `deleteAnyMessage` and `deleteOwnMessage`
 * are separate capabilities: no single flag can say "yours only".
 */
export const deleteDepartmentMessage = mutation({
  args: { messageId: v.id("groupMessages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("That message could not be found");
    if (message.owner.type !== "department") {
      throw new Error("That message does not belong to a department");
    }
    if (message.deletedAt !== undefined) {
      return { ok: true as const, alreadyDeleted: true as const };
    }

    const departmentId = message.owner.departmentId;
    const { actor, role } = await requireDepartmentCapability(
      ctx,
      departmentId,
      "deleteOwnMessage"
    );

    const can = departmentCapabilities(role);
    if (!can.deleteAnyMessage && message.sentBy !== actor._id) {
      throw new Error("A delegate can only delete the messages they sent");
    }

    await ctx.db.patch(messageId, {
      deletedAt: Date.now(),
      deletedBy: actor._id,
    });

    await logActivity(ctx, {
      actorUserId: actor._id,
      action: "department.message_deleted",
      targetType: "groupMessages",
      targetId: messageId,
      departmentId,
      metadata: { sentBy: message.sentBy },
    });

    return { ok: true as const, alreadyDeleted: false as const };
  },
});

/**
 * One group activity, for the shared detail screen and the `activity` deep
 * link (AC-7, AC-13).
 *
 * Returns `null` rather than throwing when the activity is gone, or when the
 * caller is not eligible for its group. A deep link gets forwarded, and an
 * error carrying "you are not in the Choir" would leak both the activity's
 * existence and the reader's own standing. Null means the screen shows "this is
 * no longer available" and nothing else.
 */
export const getActivity = query({
  args: { activityId: v.id("groupActivities") },
  handler: async (ctx, { activityId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const activity = await ctx.db.get(activityId);
    if (!activity) return null;

    const groups = await getEligibleGroups(ctx, user._id);
    if (!isEligibleOwner(groups, activity.owner)) return null;

    // The tag comes from the owning row's live name, so renaming a department
    // in the portal renames the tag with no backfill. A row whose group has
    // been deleted reads as unavailable rather than as an untagged activity.
    const group =
      activity.owner.type === "department"
        ? await ctx.db.get(activity.owner.departmentId)
        : await ctx.db.get(activity.owner.clanId);
    if (!group) return null;

    return {
      ...activity,
      coverImageUrl: await resolveMediaUrl(activity.coverImageUrl),
      tag: group.name,
      cancelled: activity.cancelledAt !== undefined,
    };
  },
});
