import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Seed realistic Increment 3 content: one current annual theme, one current
// monthly theme, active weekly programs across different days, upcoming events
// (with a featured one), and published announcements (mixed priority, one with
// a link + cover image). Content insertion is idempotent — skips if any themes
// already exist.
//
// Run: npx convex run contentSeed:seedContent
//
// `createdBy` is attributed to the SEED_ADMIN_EMAIL user (the bootstrapped
// system admin) if present, otherwise the earliest-created user. That actor is
// also granted an active `system_admin` roleAssignments row (idempotent) so a
// freshly seeded deployment has a working content admin (PR7a gate) with no
// manual Convex-dashboard step.

const KAMPALA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const first = await ctx.db.query("users").first();
  return first?._id ?? null;
}

/**
 * Ensure `userId` holds an active `system_admin` role assignment (PR7a content
 * gate). Idempotent — inserts one only when absent. Returns whether a new grant
 * was written.
 */
async function ensureContentAdmin(
  ctx: MutationCtx,
  userId: Id<"users">
): Promise<"granted" | "already-admin"> {
  const active = await ctx.db
    .query("roleAssignments")
    .withIndex("by_userId_status", (q) =>
      q.eq("userId", userId).eq("status", "active")
    )
    .collect();
  if (active.some((row) => row.roleType === "system_admin")) {
    return "already-admin";
  }
  await ctx.db.insert("roleAssignments", {
    userId,
    roleType: "system_admin",
    assignedBy: userId, // self-bootstrap, mirroring seed:bootstrapSystemAdmin
    status: "active",
  });
  return "granted";
}

export const seedContent = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Resolve the actor and ensure it can manage content first, so even a
    // re-run against already-seeded content still converges on a working admin.
    const createdBy = await resolveActor(ctx);
    if (!createdBy) {
      return {
        ok: false as const,
        reason: "no users exist yet — sign up a user first",
      };
    }
    const adminGrant = await ensureContentAdmin(ctx, createdBy);

    const existing = await ctx.db.query("themes").first();
    if (existing) {
      return {
        ok: false as const,
        reason: "already seeded (themes exist)",
        adminGrant,
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

    // ── Weekly programs (different days) ───────────────────────────────────
    const programs = [
      {
        title: "Sunday Service",
        description:
          "Our main weekly gathering — worship, the Word, and fellowship for the whole family.",
        dayOfWeek: 0,
        time: "09:00",
        location: "KLT Main Auditorium",
        coverImageUrl: IMG.gathering,
      },
      {
        title: "Women's Fellowship",
        description:
          "A weekly gathering for the women of the Kingdom — fellowship, prayer, and encouragement.",
        dayOfWeek: 1,
        time: "17:00",
        location: "KLT Main Auditorium",
        coverImageUrl: IMG.worship,
      },
      {
        title: "Mid-Week Service",
        description:
          "Recharge your week with the Word and worship. Join in person or online.",
        dayOfWeek: 3,
        time: "17:00",
        location: "KLT Main Auditorium",
        coverImageUrl: IMG.prayer,
      },
      {
        title: "Eagles Youth Cell",
        description:
          "Open Counsel — a safe space for the youth to gather, share, and grow together in faith.",
        dayOfWeek: 4,
        time: "17:00",
        location: "KLT Main Auditorium",
        coverImageUrl: IMG.gathering,
      },
      {
        title: "Tongues of Fire",
        description:
          "Three hours of unbroken praying in the Spirit every Friday night.",
        dayOfWeek: 5,
        time: "23:00",
        location: "KLT Main Auditorium",
        coverImageUrl: IMG.night,
      },
    ];
    for (const program of programs) {
      await ctx.db.insert("weeklyPrograms", {
        ...program,
        active: true,
        ...meta,
      });
    }

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
      adminGrant,
      themes: 2,
      programs: programs.length,
      events: events.length,
      announcements: announcements.length,
    };
  },
});
