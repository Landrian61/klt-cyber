import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Seed realistic Increment 4 data: Tower of Faith facilities, and a varied
// spread of pending-verification member profiles (one with mentorship proof,
// one without, one with children, one with a linked spouse). Departments are
// now fixed reference data seeded separately via `seed:departments` (see
// docs/Alignment.md, Increment 5) — this file no longer seeds any. Idempotent
// — skips if facilities already exist.
//
// Run: npx convex run churchAdminSeed:seedChurchAdmin

const IMG = {
  media: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=1200&q=80",
  ushering: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?w=1200&q=80",
  library: "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1200&q=80",
  hall: "https://images.unsplash.com/photo-1505409859467-3a796fd5798e?w=1200&q=80",
  clinic: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=80",
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

/** Ensure a synthetic seed user exists (idempotent on email), return its id. */
async function ensureSeedUser(
  ctx: MutationCtx,
  input: { email: string; firstName: string; lastName: string }
): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", input.email))
    .unique();
  if (existing) return existing._id;

  return await ctx.db.insert("users", {
    authId: `seed:${input.email}`,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    role: "visitor",
    status: "active",
    profileCompleted: false,
  });
}

export const seedChurchAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const createdBy = await resolveActor(ctx);
    if (!createdBy) {
      return {
        ok: false as const,
        reason: "no users exist yet — sign up a user first",
      };
    }

    const existing = await ctx.db.query("facilities").first();
    if (existing) {
      return { ok: false as const, reason: "already seeded (facilities exist)" };
    }

    const now = Date.now();
    const meta = { createdBy, createdAt: now, updatedAt: now };

    // ── Facilities (Tower of Faith) ─────────────────────────────────────────
    const facilities = [
      {
        name: "KLT Media Studio",
        tagline: "Where every message is captured and carried further.",
        description:
          "Our in-house production studio — livestream, recording, and broadcast for Reign Radio.",
        servicesOffered: ["Livestream", "Audio recording", "Radio broadcast"],
        campusBlock: "Block A, Ground Floor",
        contactPerson: "Media & Communication HOD",
        contactPhone: "+256700100100",
        imageUrl: IMG.media,
      },
      {
        name: "KLT Resource Library",
        tagline: "Feed your spirit, sharpen your mind.",
        description:
          "A lending library of books, sermons, and study materials for members.",
        servicesOffered: ["Book lending", "Study room", "Sermon archive"],
        campusBlock: "Block B, First Floor",
        contactPerson: "Library Coordinator",
        contactEmail: "library@kltcyberchurch.org",
        imageUrl: IMG.library,
      },
      {
        name: "KLT Fellowship Hall",
        tagline: "Where the Kingdom gathers to break bread.",
        description:
          "Our multipurpose hall for weddings, conferences, and fellowship meals.",
        servicesOffered: ["Event hosting", "Catering hall", "Conference seating"],
        campusBlock: "Main Campus, Annex",
        contactPerson: "Facilities Manager",
        contactPhone: "+256700100200",
        imageUrl: IMG.hall,
      },
    ];
    for (const facility of facilities) {
      await ctx.db.insert("facilities", { ...facility, active: true, ...meta });
    }

    // ── Member profiles (pending_verification, varied spread) ───────────────
    const graceId = await ensureSeedUser(ctx, {
      email: "grace.nakato@seed.kltcyberchurch.org",
      firstName: "Grace",
      lastName: "Nakato",
    });
    const danielId = await ensureSeedUser(ctx, {
      email: "daniel.okello@seed.kltcyberchurch.org",
      firstName: "Daniel",
      lastName: "Okello",
    });
    const ruthId = await ensureSeedUser(ctx, {
      email: "ruth.amara@seed.kltcyberchurch.org",
      firstName: "Ruth",
      lastName: "Amara",
    });
    const peterId = await ensureSeedUser(ctx, {
      email: "peter.ssentongo@seed.kltcyberchurch.org",
      firstName: "Peter",
      lastName: "Ssentongo",
    });
    const susanId = await ensureSeedUser(ctx, {
      email: "susan.ssentongo@seed.kltcyberchurch.org",
      firstName: "Susan",
      lastName: "Ssentongo",
    });

    const profileMeta = {
      mentorshipStatus: "completed" as const,
      profileStatus: "pending_verification" as const,
      createdAt: now,
      updatedAt: now,
    };

    // Grace — has mentorship proof on file.
    const existingGrace = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", graceId))
      .unique();
    if (!existingGrace) {
      await ctx.db.insert("memberProfiles", {
        userId: graceId,
        firstName: "Grace",
        lastName: "Nakato",
        phone: "+256700111222",
        sex: "female",
        dateOfBirth: { day: 23, month: 4, year: 1998 },
        maritalStatus: "single",
        shortBio: "Loves serving in worship and community outreach.",
        mentorshipProofUrl:
          "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80",
        occupation: "Graphic Designer",
        industry: "Creative",
        ...profileMeta,
      });
    }

    // Daniel — no mentorship proof; admin must follow up manually.
    const existingDaniel = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", danielId))
      .unique();
    if (!existingDaniel) {
      await ctx.db.insert("memberProfiles", {
        userId: danielId,
        firstName: "Daniel",
        lastName: "Okello",
        phone: "+256700333444",
        sex: "male",
        maritalStatus: "single",
        occupation: "Videographer",
        ...profileMeta,
      });
    }

    // Ruth — submitted with two children attached.
    const existingRuth = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", ruthId))
      .unique();
    if (!existingRuth) {
      await ctx.db.insert("memberProfiles", {
        userId: ruthId,
        firstName: "Ruth",
        lastName: "Amara",
        phone: "+256700555666",
        sex: "female",
        maritalStatus: "married",
        mentorshipProofUrl:
          "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=800&q=80",
        occupation: "Nurse",
        industry: "Healthcare",
        ...profileMeta,
      });
      await ctx.db.insert("children", {
        parentUserId: ruthId,
        name: "Esther Amara",
        dateOfBirth: Date.UTC(2015, 5, 1),
        sex: "female",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("children", {
        parentUserId: ruthId,
        name: "Isaac Amara",
        dateOfBirth: Date.UTC(2018, 2, 12),
        sex: "male",
        createdAt: now,
        updatedAt: now,
      });
    }

    // Peter — married, spouse linked to Susan (also a seeded user).
    const existingPeter = await ctx.db
      .query("memberProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", peterId))
      .unique();
    if (!existingPeter) {
      await ctx.db.insert("memberProfiles", {
        userId: peterId,
        firstName: "Peter",
        lastName: "Ssentongo",
        phone: "+256700777888",
        sex: "male",
        maritalStatus: "married",
        spouseUserId: susanId,
        anniversaryDate: Date.UTC(2016, 7, 20),
        mentorshipProofUrl:
          "https://images.unsplash.com/photo-1554224154-26032fced8bd?w=800&q=80",
        occupation: "Accountant",
        industry: "Finance",
        ...profileMeta,
      });
    }

    return {
      ok: true as const,
      facilities: facilities.length,
      memberProfiles: 4,
    };
  },
});
