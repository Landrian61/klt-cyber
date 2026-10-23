import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertSampleSeedAllowed } from "./lib/environment";

// Seed realistic Increment 3 *sample* content: one current annual theme, one
// current monthly theme, upcoming events (with a featured one), and published
// announcements (mixed priority, one with a link + cover image). Content
// insertion is idempotent — skips if any themes already exist.
//
// Sample data only — never safe for production. Requires an explicit
// `allowSampleData: true` argument AND the production guard to pass before
// writing anything (spec 0001, AC-2). The five recurring weekly programs are
// real content, not sample data, and have moved to seed.ts:weeklyPrograms,
// which carries no guard.
//
// Run: npx convex run contentSeed:seedContent '{"allowSampleData": true}'
//
// `createdBy` is attributed to the SEED_ADMIN_EMAIL user (the bootstrapped
// system admin) if present, otherwise the earliest-created user. This
// mutation never grants any role (spec 0001, AC-1) — the only role grant in
// any seed function is seed:bootstrapSystemAdmin's.

const KAMPALA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Unsplash cover images — plain URLs, matching the pasted-URL policy for v1. */
const IMG = {
  theme: "https://images.unsplash.com/photo-1438032005730-c779502df39b?w=1200&q=80",
  worship: "https://images.unsplash.com/photo-1510590337019-5ef8d3d32116?w=1200&q=80",
  prayer: "https://images.unsplash.com/photo-1544427920-c49ccfb85579?w=1200&q=80",
  gathering: "https://images.unsplash.com/photo-1507692049790-de58290a4334?w=1200&q=80",
  night: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&q=80",
  event: "https://images.unsplash.com/photo-1519491050282-cf00c82424b4?w=1200&q=80",
} as const;

async function resolveActor(ctx: MutationCtx): Promise<Id<"users"> | null> {
  const email = process.env.SEED_ADMIN_EMAIL;
  if (email) {
    const admin = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (admin) return admin._id;
  }
  // Not just the first row: a deleted account is anonymized and cannot sign
  // in, so attributing seeded content to it would be attributing it to
  // nobody (spec 0008 AC-22).
  const first = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .first();
  return first?._id ?? null;
}

export const seedContent = internalMutation({
  args: { allowSampleData: v.optional(v.boolean()) },
  handler: async (ctx, { allowSampleData }) => {
    assertSampleSeedAllowed(allowSampleData);

    const createdBy = await resolveActor(ctx);
    if (!createdBy) {
      return {
        ok: false as const,
        reason: "no users exist yet — sign up a user first",
      };
    }

    const existing = await ctx.db.query("themes").first();
    if (existing) {
      return {
        ok: false as const,
        reason: "already seeded (themes exist)",
      };
    }

    const now = Date.now();
    const local = new Date(now + KAMPALA_OFFSET_MS);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();

    const startOfDayUtc = (y: number, m: number, d: number) =>
      Date.UTC(y, m, d, 0, 0, 0) - KAMPALA_OFFSET_MS;
    const endOfDayUtc = (y: number, m: number, d: number) =>
      Date.UTC(y, m, d, 23, 59, 59) - KAMPALA_OFFSET_MS;
    const at = (y: number, m: number, d: number, hh: number, mm = 0) =>
      Date.UTC(y, m, d, hh, mm) - KAMPALA_OFFSET_MS;

    const meta = { createdBy, createdAt: now, updatedAt: now };

    // ── Themes ────────────────────────────────────────────────────────────
    await ctx.db.insert("themes", {
      scope: "annual",
      title: "The Year of Kingdom Leadership and Governance",
      scriptureReference: "Matthew 16:19",
      scriptureText:
        "And I will give unto thee the keys of the kingdom of heaven: and whatsoever thou shalt bind on earth shall be bound in heaven: and whatsoever thou shalt loose on earth shall be loosed in heaven.",
      coverImageUrl: IMG.theme,
      periodStart: startOfDayUtc(year, 0, 1),
      periodEnd: endOfDayUtc(year, 11, 31),
      ...meta,
    });
    await ctx.db.insert("themes", {
      scope: "monthly",
      title: "A Month of Divine Alignment",
      scriptureReference: "Proverbs 16:9",
      scriptureText:
        "A man's heart deviseth his way: but the LORD directeth his steps.",
      coverImageUrl: IMG.worship,
      periodStart: startOfDayUtc(year, month, 1),
      periodEnd: endOfDayUtc(year, month + 1, 0), // last day of this month
      ...meta,
    });

    // ── Upcoming events (>= one featured) ──────────────────────────────────
    const events = [
      {
        title: "Holy Ghost Night",
        description:
          "A night of deep worship, prophetic ministry, and corporate prayer. Join us in person or online.",
        location: "KLT Main Auditorium",
        startDateTime: at(year, month, local.getUTCDate() + 5, 20),
        endDateTime: at(year, month, local.getUTCDate() + 6, 5),
        coverImageUrl: IMG.night,
        featured: true,
      },
      {
        title: "Kingdom Leadership Summit",
        description:
          "A two-day summit equipping members for leadership and governance in every sphere.",
        location: "KLT Main Auditorium",
        startDateTime: at(year, month, local.getUTCDate() + 12, 9),
        endDateTime: at(year, month, local.getUTCDate() + 13, 17),
        coverImageUrl: IMG.gathering,
        featured: true,
      },
      {
        title: "Water Baptism Service",
        description:
          "All who have not yet been baptised are invited to register at the front desk.",
        location: "KLT Main Auditorium",
        startDateTime: at(year, month, local.getUTCDate() + 9, 11),
        endDateTime: at(year, month, local.getUTCDate() + 9, 13),
        coverImageUrl: IMG.worship,
        featured: false,
      },
      {
        title: "New Month Crossover",
        description:
          "A powerful crossover into the new month — prophetic declarations, prayer, and worship.",
        location: "Online — reignradio.caster.fm",
        startDateTime: at(year, month + 1, 0, 23), // last day of month, 23:00
        endDateTime: at(year, month + 1, 1, 1),
        coverImageUrl: IMG.event,
        featured: false,
      },
    ];
    for (const event of events) {
      await ctx.db.insert("events", { ...event, active: true, ...meta });
    }

    // ── Announcements (mixed priority; one with link + cover image) ─────────
    const startWindow = now - DAY_MS;
    const endWindow = now + 30 * DAY_MS;
    const announcements = [
      {
        title: "Registration Open: Kingdom Leadership Summit",
        body: "Registration for the upcoming Kingdom Leadership Summit is now open. Secure your place and invite a friend — seats are limited.",
        category: "event",
        priority: "high" as const,
        coverImageUrl: IMG.gathering,
        links: [
          {
            label: "Register now",
            url: "https://kltcyberchurch.org/summit",
          },
        ],
      },
      {
        title: "Weekly Programs Reminder",
        body: "All our weekly programs are running as scheduled this week. Sunday Service 9:00 AM, Women's Fellowship Monday 5:00 PM, Mid-Week Service Wednesday 5:00 PM, Youth Cell Thursday 5:00 PM, and Tongues of Fire every Friday 11:00 PM.",
        category: "program",
        priority: "normal" as const,
      },
      {
        title: "Tithe & Offering — Online Giving",
        body: "You can now give your tithe and offering online through the app. Thank you for your faithful partnership in the Kingdom.",
        category: "general",
        priority: "low" as const,
      },
    ];
    for (const a of announcements) {
      await ctx.db.insert("announcements", {
        title: a.title,
        body: a.body,
        category: a.category,
        priority: a.priority,
        ...(a.coverImageUrl ? { coverImageUrl: a.coverImageUrl } : {}),
        ...(a.links ? { links: a.links } : {}),
        startDate: startWindow,
        endDate: endWindow,
        status: "published",
        ...meta,
      });
    }

    return {
      ok: true as const,
      themes: 2,
      events: events.length,
      announcements: announcements.length,
    };
  },
});

// ── Spec 0010 — group content samples ────────────────────────────────────────
// Sample group activities and messages, plus the roster and clan rows the test
// accounts need, so the My groups section and the merged upcoming list are
// provable before any authoring interface exists (features 17 and 23 own that).
//
// Sample data only — never safe for production. Same two guards every other
// sample seed carries: an explicit `allowSampleData: true` AND the production
// check (spec 0001, AC-2).
//
// Run: npx convex run contentSeed:seedGroupSamples '{"allowSampleData": true}'
//
// Dates are relative to the moment it runs, so the horizon and window edges
// stay meaningful however long after seeding you look. The rows deliberately
// include an activity that is already running, a cancelled one, one past the
// 8 week horizon, a soft-deleted message, a third department with a roster row
// and no messages at all, and an event carrying cancellation fields.
//
// One row AC-14 asks for is missing: a message older than the 90 day window.
// `groupMessages` has no `sentAt` by design (the window compares against
// `_creationTime`), and `_creationTime` is assigned by Convex and cannot be
// backdated by a seed.
//
// So the 90 day window is NOT provable from this seed, and nothing else covers
// it yet either. It needs a Convex test with a faked clock, which the spec's
// still-open "Test it" milestone owns; verify.md's window rows cannot be ticked
// before that exists.
export const seedGroupSamples = internalMutation({
  args: { allowSampleData: v.optional(v.boolean()) },
  handler: async (ctx, { allowSampleData }) => {
    assertSampleSeedAllowed(allowSampleData);

    const createdBy = await resolveActor(ctx);
    if (!createdBy) {
      return {
        ok: false as const,
        reason: "no users exist yet — sign up a user first",
      };
    }

    // Idempotent on the activities table, the same way seedContent is on
    // themes: re-running it adds nothing rather than doubling every group.
    if (await ctx.db.query("groupActivities").first()) {
      return {
        ok: false as const,
        reason: "already seeded (group activities exist)",
      };
    }

    // Departments and clans are seeded reference data, not sample data
    // (seed:departments, seed:clans) — this seed attaches to them rather than
    // inventing its own, so the names on the tags are the real ones.
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_order")
      .take(3);
    if (departments.length < 3) {
      return {
        ok: false as const,
        reason: "run seed:departments first (3 departments needed)",
      };
    }
    // Prefer a clan the existing profiles are already in, with a verified one
    // winning, because that is the only caller who may read clan content at
    // all (AC-3). Seeding into the first clan by order instead would put the
    // messages somewhere none of the test accounts can see them, which looks
    // exactly like a broken eligibility rule. Falls back to the first clan by
    // order on a deployment where nobody has picked one yet.
    const profiles = await ctx.db.query("memberProfiles").collect();
    const claimedClanId =
      profiles.find((p) => p.profileStatus === "verified" && p.clanId)?.clanId ??
      profiles.find((p) => p.clanId)?.clanId;
    const clan = claimedClanId
      ? await ctx.db.get(claimedClanId)
      : await ctx.db.query("clans").withIndex("by_order").first();
    if (!clan) {
      return { ok: false as const, reason: "run seed:clans first" };
    }

    const [deptA, deptB, deptC] = departments;
    const now = Date.now();
    const meta = { createdBy, createdAt: now, updatedAt: now };

    const departmentOwner = (departmentId: Id<"departments">) => ({
      type: "department" as const,
      departmentId,
    });
    const clanOwner = { type: "clan" as const, clanId: clan._id };

    // ── The test accounts' memberships ────────────────────────────────────
    // Keyed off profile status rather than hard-coded emails, so whoever the
    // three verify accounts happen to be on this deployment, they end up in
    // the right shape:
    //   verified profile  → three department rosters + the clan (sees both)
    //   pending profile   → one department roster + the clan (sees the
    //                       department only, since an unverified clanId is
    //                       just a claim — AC-3)
    //   no profile at all → nothing, which is the visitor case
    // Deliberately additive and skip-if-present, so re-running it cannot
    // double a roster row or move someone's real clan.
    let rostersAdded = 0;
    let clansSet = 0;

    for (const profile of profiles) {
      const wanted =
        profile.profileStatus === "verified"
          ? [deptA._id, deptB._id, deptC._id]
          : [deptA._id];

      const already = await ctx.db
        .query("departmentMemberships")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", profile.userId).eq("status", "active")
        )
        .collect();

      for (const departmentId of wanted) {
        if (already.some((m) => m.departmentId === departmentId)) continue;
        await ctx.db.insert("departmentMemberships", {
          userId: profile.userId,
          departmentId,
          addedBy: createdBy,
          status: "active",
        });
        rostersAdded += 1;
      }

      if (profile.clanId === undefined) {
        await ctx.db.patch(profile._id, { clanId: clan._id, updatedAt: now });
        clansSet += 1;
      }
    }

    // ── Activities ────────────────────────────────────────────────────────
    const activities = [
      {
        // Started an hour ago, ends in an hour: proves a row leaves the list
        // on its END time and not its start (AC-5).
        owner: departmentOwner(deptA._id),
        title: "Ushers pre-service briefing",
        description:
          "Quick run-through of the seating plan and the offertory order. Meet at the main entrance.",
        startDateTime: now - HOUR_MS,
        endDateTime: now + HOUR_MS,
        location: "Main auditorium entrance",
        coverImageUrl: IMG.gathering,
      },
      {
        owner: departmentOwner(deptA._id),
        title: "Ushers monthly huddle",
        description:
          "Numbers from last month, the new welcome script, and who covers which service in the weeks ahead.",
        startDateTime: now + 3 * DAY_MS,
        endDateTime: now + 3 * DAY_MS + 2 * HOUR_MS,
        location: "Fellowship hall",
      },
      {
        // Cancelled but still dated: keeps its place in the list, marked
        // (AC-6).
        owner: departmentOwner(deptA._id),
        title: "Ushers training — new intake",
        description: "Induction for everyone who joined the team this quarter.",
        startDateTime: now + 10 * DAY_MS,
        endDateTime: now + 10 * DAY_MS + 3 * HOUR_MS,
        location: "Room 2, Tower of Faith",
        cancelledAt: now,
        cancelledBy: createdBy,
        cancellationReason: "The hall is being repainted; a new date follows.",
      },
      {
        owner: departmentOwner(deptB._id),
        title: "Choir rehearsal",
        description: "Sunday's set, plus the two new songs for the convention.",
        startDateTime: now + DAY_MS,
        endDateTime: now + DAY_MS + 2 * HOUR_MS,
        location: "Choir room",
        coverImageUrl: IMG.worship,
      },
      {
        // Past the 8 week horizon: must NOT appear on the merged list (AC-5).
        owner: departmentOwner(deptB._id),
        title: "Choir retreat",
        description: "Two days away for rest, rehearsal and planning.",
        startDateTime: now + 70 * DAY_MS,
        endDateTime: now + 72 * DAY_MS,
        location: "Kawuku",
      },
      {
        // deptC gets an activity and NO messages, which is what proves a
        // group with nothing to say shows no My groups heading at all (AC-2).
        owner: departmentOwner(deptC._id),
        title: "Department planning meeting",
        startDateTime: now + 6 * DAY_MS,
        endDateTime: now + 6 * DAY_MS + HOUR_MS,
      },
      {
        owner: clanOwner,
        title: "Clan fellowship evening",
        description:
          "Supper together, testimonies, and prayer for the families in the clan.",
        startDateTime: now + 5 * DAY_MS,
        endDateTime: now + 5 * DAY_MS + 3 * HOUR_MS,
        location: "Elder's home, Kireka",
        coverImageUrl: IMG.prayer,
      },
    ];
    for (const a of activities) {
      await ctx.db.insert("groupActivities", { ...a, ...meta });
    }

    // ── Messages ──────────────────────────────────────────────────────────
    const messages = [
      {
        owner: departmentOwner(deptA._id),
        body: "Please be at the auditorium by 8:15 AM on Sunday — we are one service short on the 10 AM.",
      },
      {
        owner: departmentOwner(deptA._id),
        body: "The new name badges have arrived. Collect yours from the office before Sunday.",
        imageUrl: IMG.gathering,
      },
      {
        owner: departmentOwner(deptA._id),
        // Soft deleted: must never appear in My groups (AC-4), and is never
        // purged, so S5-03 keeps its audit trail.
        body: "Ignore the earlier roster — this message was sent in error.",
        deletedAt: now,
        deletedBy: createdBy,
      },
      {
        owner: departmentOwner(deptB._id),
        body: "Rehearsal moves to 5:30 PM this week only. Bring your own water.",
      },
      {
        owner: clanOwner,
        body: "Our clan ministers at the second service next Sunday. Everyone in white, please.",
      },
      {
        owner: clanOwner,
        body: "Thank you to all who turned up for the burial in Mukono. The family felt it.",
      },
    ];
    for (const m of messages) {
      await ctx.db.insert("groupMessages", { ...m, sentBy: createdBy });
    }

    // ── An event carrying the cancellation fields (AC-12) ─────────────────
    // Feature 18 ships the portal action that writes these; this row is how
    // the read side is proved before then.
    await ctx.db.insert("events", {
      title: "Church-wide prayer breakfast",
      description:
        "An early morning of prayer and a shared meal, open to the whole church.",
      location: "Fellowship hall",
      startDateTime: now + 14 * DAY_MS,
      endDateTime: now + 14 * DAY_MS + 3 * HOUR_MS,
      coverImageUrl: IMG.prayer,
      featured: false,
      active: true,
      cancelledAt: now,
      cancelledBy: createdBy,
      cancellationReason: "Postponed to make room for the regional convention.",
      ...meta,
    });

    return {
      ok: true as const,
      activities: activities.length,
      messages: messages.length,
      cancelledEvents: 1,
      rostersAdded,
      clansSet,
      departments: departments.map((d) => d.name),
      clan: clan.name,
    };
  },
});
