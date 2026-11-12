import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAdministrationCallerOrNull } from "./lib/authz";
import { resolvePhotoUrlForUser } from "./lib/identity";
import { displayName } from "./lib/roleNotices";

/** Public — the 12 clans in display order. Used by the profile-completion UI. */
export const listClans = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("clans").withIndex("by_order").collect();
  },
});

/**
 * The 12 clans with their elders, for the Administration Clans page (spec
 * 0021, AC-7, SRS A3-05, A3-06): the elder (or none) and the verified member
 * count. `null`, never a throw, for anyone without Administration authority.
 */
export const listForAdministration = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getAdministrationCallerOrNull(ctx))) return null;

    const clans = await ctx.db.query("clans").withIndex("by_order").collect();

    return Promise.all(
      clans.map(async (clan) => {
        const [elderRow, verifiedProfiles] = await Promise.all([
          ctx.db
            .query("roleAssignments")
            .withIndex("by_clanId", (q) => q.eq("clanId", clan._id))
            .filter((q) =>
              q.and(
                q.eq(q.field("roleType"), "clan_elder"),
                q.eq(q.field("status"), "active")
              )
            )
            .first(),
          ctx.db
            .query("memberProfiles")
            .withIndex("by_clanId_profileStatus", (q) =>
              q.eq("clanId", clan._id).eq("profileStatus", "verified")
            )
            .collect(),
        ]);

        const elderUser = elderRow ? await ctx.db.get(elderRow.userId) : null;
        const elder =
          elderRow && elderUser
            ? {
                userId: elderRow.userId,
                roleAssignmentId: elderRow._id,
                name: displayName(elderUser),
                photoUrl:
                  (await resolvePhotoUrlForUser(ctx, elderRow.userId)) ?? null,
              }
            : null;

        return {
          _id: clan._id,
          name: clan.name,
          order: clan.order,
          elder,
          verifiedMemberCount: verifiedProfiles.length,
        };
      })
    );
  },
});

/** The most candidates the elder picker lists at once. */
const MAX_ELDER_CANDIDATES = 50;

/**
 * Who may be appointed elder of a clan: its verified members (spec 0021,
 * AC-8), optionally narrowed by a name search, at most 50. The same rule
 * `roles.assignRole` enforces with `ELDER_NOT_IN_CLAN`, so the picker never
 * offers someone the server would refuse.
 */
export const listElderCandidates = query({
  args: { clanId: v.id("clans"), search: v.optional(v.string()) },
  handler: async (ctx, { clanId, search }) => {
    if (!(await getAdministrationCallerOrNull(ctx))) return null;

    const profiles = await ctx.db
      .query("memberProfiles")
      .withIndex("by_clanId_profileStatus", (q) =>
        q.eq("clanId", clanId).eq("profileStatus", "verified")
      )
      .collect();

    const needle = search?.trim().toLowerCase() ?? "";
    const matches = profiles
      .map((profile) => ({
        profile,
        name: [profile.firstName, profile.middleName, profile.lastName]
          .filter(Boolean)
          .join(" "),
      }))
      .filter(({ name }) => !needle || name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_ELDER_CANDIDATES);

    return Promise.all(
      matches.map(async ({ profile, name }) => ({
        userId: profile.userId,
        name,
        photoUrl:
          (await resolvePhotoUrlForUser(ctx, profile.userId, profile)) ?? null,
      }))
    );
  },
});
