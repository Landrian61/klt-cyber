import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  compareDirectoryRows,
  isListable,
  loadClanLookup,
  requireDirectoryViewer,
  toDirectoryCard,
  toDirectoryRow,
} from "./lib/directory";

// The member directory (spec 0022, SRS M5-01 to M5-05, NF-02). Two reactive
// reads, both for verified members only. Every row and card is built by the
// gating helpers in `lib/directory.ts`; nothing here shapes a field itself.
//
// The list carries no phone or email at all: contact details leave the server
// one card at a time, through `getCard`.

/**
 * Every verified member, plus the viewer's own row and the filter options.
 * The phone searches and filters this in memory (spec 0022, option 1).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireDirectoryViewer(ctx);
    const [clans, departments, profiles] = await Promise.all([
      loadClanLookup(ctx),
      ctx.db.query("departments").withIndex("by_order").collect(),
      ctx.db
        .query("memberProfiles")
        .withIndex("by_profileStatus", (q) => q.eq("profileStatus", "verified"))
        .collect(),
    ]);

    // Areas of Service: active memberships only, so a pending claim never
    // shows (AC-1). One index read per department rather than per member, run
    // in parallel, then folded in department order.
    const membershipsByDepartment = await Promise.all(
      departments.map((department) =>
        ctx.db
          .query("departmentMemberships")
          .withIndex("by_departmentId_status", (q) =>
            q.eq("departmentId", department._id).eq("status", "active")
          )
          .collect()
      )
    );
    const departmentIdsByUser = new Map<Id<"users">, Id<"departments">[]>();
    departments.forEach((department, index) => {
      for (const membership of membershipsByDepartment[index]) {
        const ids = departmentIdsByUser.get(membership.userId) ?? [];
        if (!ids.includes(department._id)) ids.push(department._id);
        departmentIdsByUser.set(membership.userId, ids);
      }
    });

    const rows = (
      await Promise.all(
        profiles.map(async (profile) => {
          if (profile.userId === viewer.user._id) return null;
          const user = await ctx.db.get(profile.userId);
          // A backstop: deletion already removes the profile.
          if (!isListable(user, profile)) return null;
          return await toDirectoryRow(
            viewer,
            { user, profile },
            clans,
            departmentIdsByUser.get(user._id) ?? []
          );
        })
      )
    ).filter((row) => row !== null);
    rows.sort(compareDirectoryRows);

    const self = await toDirectoryRow(
      viewer,
      { user: viewer.user, profile: viewer.profile },
      clans,
      departmentIdsByUser.get(viewer.user._id) ?? []
    );

    return {
      viewerSharing: viewer.sharing,
      self,
      rows,
      departments: departments.map((d) => ({ id: d._id, name: d.name })),
      clans: [...clans.values()],
    };
  },
});

/**
 * One member's card. `null` (never an error) for anybody not in the directory,
 * whatever the reason, so the cases cannot be told apart (AC-14).
 *
 * `userId` is a plain string, normalized here, rather than `v.id("users")`:
 * the id arrives from a route param, and a malformed or wrong table id must
 * read as "not in the directory" too, not as an argument validation error.
 */
export const getCard = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireDirectoryViewer(ctx);

    const userId = ctx.db.normalizeId("users", args.userId);
    const user = userId ? await ctx.db.get(userId) : null;
    const profile = user
      ? await ctx.db
          .query("memberProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .unique()
      : null;
    if (!isListable(user, profile) || !profile) return null;

    const memberships = await ctx.db
      .query("departmentMemberships")
      .withIndex("by_userId_status", (q) => q.eq("userId", user._id).eq("status", "active"))
      .collect();
    const memberOf = new Set(memberships.map((m) => m.departmentId));

    // The card resolves its own Areas of Service names, so the card screen
    // never has to subscribe to the whole list just to label a few pills.
    const [clans, departments] = await Promise.all([
      loadClanLookup(ctx),
      ctx.db.query("departments").withIndex("by_order").collect(),
    ]);
    const areas = departments
      .filter((d) => memberOf.has(d._id))
      .map((d) => ({ id: d._id, name: d.name }));

    const card = await toDirectoryCard(
      viewer,
      { user, profile },
      clans,
      areas.map((a) => a.id)
    );
    return { ...card, areas };
  },
});
