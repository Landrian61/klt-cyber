import { internalMutation, type MutationCtx } from "./_generated/server";
import { KAMPALA_OFFSET_MS } from "./calendar";
import type {
  BillingCycle,
  CostCurrency,
  CostServiceKey,
} from "@klt-cyber/shared";

// The 12 clans in birth order (Genesis 29–30, 35).
const CLAN_NAMES = [
  "Reuben",
  "Simeon",
  "Levi",
  "Judah",
  "Dan",
  "Naphtali",
  "Gad",
  "Asher",
  "Issachar",
  "Zebulun",
  "Joseph",
  "Benjamin",
] as const;

/**
 * Ensure the 12 clan records exist with their canonical names and 1..12 order.
 * Idempotent — inserts only the missing ones.
 */
export const clans = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0;
    for (let i = 0; i < CLAN_NAMES.length; i++) {
      const name = CLAN_NAMES[i];
      const order = i + 1;
      const existing = await ctx.db
        .query("clans")
        .filter((q) => q.eq(q.field("name"), name))
        .first();
      if (!existing) {
        await ctx.db.insert("clans", { name, order });
        created++;
      }
    }
    const total = (await ctx.db.query("clans").collect()).length;
    return { created, total };
  },
});

/**
 * Bootstrap the first system admin from SEED_ADMIN_EMAIL. Ensures exactly one
 * active `roleAssignments` row with roleType=system_admin for that user, and
 * migrates any legacy `users.role === "system_admin"` (from Increment 1) back to
 * "visitor". Idempotent.
 */
async function bootstrapSystemAdminHandler(ctx: MutationCtx) {
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) throw new Error("SEED_ADMIN_EMAIL not set");

  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (!user) return { ok: false as const, reason: "no user" };

  // Migrate any legacy base-role system_admin to visitor (role union no longer
  // permits it). Cast: the field is typed visitor|member after the amendment.
  if ((user.role as string) === "system_admin") {
    await ctx.db.patch(user._id, { role: "visitor" });
  }

  const existing = await ctx.db
    .query("roleAssignments")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .filter((q) =>
      q.and(
        q.eq(q.field("roleType"), "system_admin"),
        q.eq(q.field("status"), "active")
      )
    )
    .first();
  if (existing) {
    return {
      ok: true as const,
      created: false,
      userId: user._id,
      roleAssignmentId: existing._id,
    };
  }

  const roleAssignmentId = await ctx.db.insert("roleAssignments", {
    userId: user._id,
    roleType: "system_admin",
    assignedBy: user._id,
    status: "active",
  });
  await ctx.db.insert("activityLogs", {
    actorUserId: user._id,
    action: "role.assigned",
    targetType: "roleAssignments",
    targetId: roleAssignmentId,
    metadata: { roleType: "system_admin", bootstrap: true },
  });

  return {
    ok: true as const,
    created: true,
    userId: user._id,
    roleAssignmentId,
  };
}

export const bootstrapSystemAdmin = internalMutation({
  args: {},
  handler: (ctx) => bootstrapSystemAdminHandler(ctx),
});

/**
 * @deprecated Increment 1's bootstrap. Superseded by `bootstrapSystemAdmin`,
 * which it now delegates to. Kept so existing CI/docs references keep working;
 * remove in a follow-up.
 */
export const promoteSeedAdmin = internalMutation({
  args: {},
  handler: (ctx) => bootstrapSystemAdminHandler(ctx),
});

// The 13 Areas of Service. "Administration"
// must be first/present — convex/lib/authz.ts looks it up by exact name.
// `description` is a one-line hint of what the department does, shown on its
// picker card — still fixed/seeded data, not admin-editable. Phrased in
// first person/imperative ("Lead", not "Leads") — each card reads as that
// department introducing itself, not a third-party summary of it.
const DEPARTMENTS = [
  {
    name: "Administration",
    description:
      "Coordinate church operations, governance, and cross-department support.",
  },
  {
    name: "Pastoral",
    description: "Shepherd the congregation through counsel, prayer, and pastoral care.",
  },
  {
    name: "Finance",
    description: "Steward church resources, budgeting, and financial accountability.",
  },
  {
    name: "Education",
    description: "Lead discipleship, Bible study, and teaching ministries.",
  },
  {
    name: "Media",
    description: "Capture and share services through photography, livestream, and broadcast.",
  },
  {
    name: "Worship Ministry",
    description: "Lead the congregation in praise, worship, and musical ministry.",
  },
  {
    name: "Ushering",
    description: "Welcome and guide the congregation before, during, and after service.",
  },
  {
    name: "Missions & Outreach",
    description: "Carry the gospel beyond the church through local and cross-border outreach.",
  },
  {
    name: "Hospitality",
    description: "Care for guests, fellowship meals, and church events.",
  },
  {
    name: "Children's Ministry",
    description: "Nurture the youngest members through age-appropriate discipleship and care.",
  },
  {
    name: "Eagles Youth",
    description: "Disciple and mentor teens and young adults.",
  },
  {
    name: "Real Estate",
    description: "Oversee church property, facilities, and physical infrastructure.",
  },
  {
    name: "Library & Information",
    description: "Maintain the church's resource library and information access.",
  },
] as const;

/**
 * Ensure the 13 fixed department records exist with their canonical names,
 * 1..13 order, and description. Idempotent — inserts missing rows, and
 * patches `order`/`description` on existing ones so re-running safely
 * backfills fields added after the initial seed (e.g. `description` itself,
 * added post-launch). Mirrors `clans` above, plus the backfill.
 */
export const departments = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0;
    let updated = 0;
    for (let i = 0; i < DEPARTMENTS.length; i++) {
      const { name, description } = DEPARTMENTS[i];
      const order = i + 1;
      const existing = await ctx.db
        .query("departments")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (!existing) {
        await ctx.db.insert("departments", { name, order, description });
        created++;
      } else if (existing.order !== order || existing.description !== description) {
        await ctx.db.patch(existing._id, { order, description });
        updated++;
      }
    }
    const total = (await ctx.db.query("departments").collect()).length;
    return { created, updated, total };
  },
});

// The three Tower of Faith facilities, seeded everywhere (including
// production) as hidden drafts — name only, so Real Estate fills in the rest
// after launch (spec 0001, AC-3).
const FACILITY_DRAFT_NAMES = [
  "KLT Media Studio",
  "KLT Resource Library",
  "KLT Fellowship Hall",
] as const;

/**
 * Ensure the three Tower of Faith facilities exist as hidden drafts
 * (active: false, name only), attributed to the SEED_ADMIN_EMAIL user. Safe
 * everywhere including production. Idempotent — inserts only if absent by name, so it can
 * run in either order relative to churchAdminSeed:seedChurchAdmin without
 * creating duplicates (AC-7).
 */
export const facilityDrafts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const email = process.env.SEED_ADMIN_EMAIL;
    if (!email) return { ok: false as const, reason: "SEED_ADMIN_EMAIL not set" };
    const admin = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!admin) {
      return { ok: false as const, reason: "no SEED_ADMIN_EMAIL user yet" };
    }

    const now = Date.now();
    let created = 0;
    for (const name of FACILITY_DRAFT_NAMES) {
      const existing = await ctx.db
        .query("facilities")
        .filter((q) => q.eq(q.field("name"), name))
        .first();
      if (!existing) {
        await ctx.db.insert("facilities", {
          name,
          active: false,
          createdBy: admin._id,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }
    const total = (await ctx.db.query("facilities").collect()).length;
    return { ok: true as const, created, total };
  },
});

// The five recurring weekly programs — real content, not sample data (the
// engineer's call, spec 0001), so this carries no production guard. Extracted
// from contentSeed.ts and rewritten onto the current recurrence fields
// (recurrence/daysOfWeek/startDate/startTime), dropping the deprecated
// dayOfWeek/time pair and the Unsplash coverImageUrl placeholders.
const WEEKLY_PROGRAMS = [
  {
    title: "Sunday Service",
    description:
      "Our main weekly gathering — worship, the Word, and fellowship for the whole family.",
    daysOfWeek: [0],
    startDate: Date.UTC(2026, 0, 4) - KAMPALA_OFFSET_MS,
    startTime: "09:00",
    location: "KLT Main Auditorium",
  },
  {
    title: "Women's Fellowship",
    description:
      "A weekly gathering for the women of the Kingdom — fellowship, prayer, and encouragement.",
    daysOfWeek: [1],
    startDate: Date.UTC(2026, 0, 5) - KAMPALA_OFFSET_MS,
    startTime: "17:00",
    location: "KLT Main Auditorium",
  },
  {
    title: "Mid-Week Service",
    description:
      "Recharge your week with the Word and worship. Join in person or online.",
    daysOfWeek: [3],
    startDate: Date.UTC(2026, 0, 7) - KAMPALA_OFFSET_MS,
    startTime: "17:00",
    location: "KLT Main Auditorium",
  },
  {
    title: "Eagles Youth Cell",
    description:
      "Open Counsel — a safe space for the youth to gather, share, and grow together in faith.",
    daysOfWeek: [4],
    startDate: Date.UTC(2026, 0, 8) - KAMPALA_OFFSET_MS,
    startTime: "17:00",
    location: "KLT Main Auditorium",
  },
  {
    title: "Tongues of Fire",
    description:
      "Three hours of unbroken praying in the Spirit every Friday night.",
    daysOfWeek: [5],
    startDate: Date.UTC(2026, 0, 9) - KAMPALA_OFFSET_MS,
    startTime: "23:00",
    location: "KLT Main Auditorium",
  },
] as const;

/**
 * Ensure the five recurring weekly programs exist, attributed to the
 * SEED_ADMIN_EMAIL user, written onto the current recurrence fields. Safe
 * everywhere including production (real content, no guard). Idempotent on
 * `title`.
 */
export const weeklyPrograms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const email = process.env.SEED_ADMIN_EMAIL;
    if (!email) return { ok: false as const, reason: "SEED_ADMIN_EMAIL not set" };
    const admin = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!admin) {
      return { ok: false as const, reason: "no SEED_ADMIN_EMAIL user yet" };
    }

    const now = Date.now();
    let created = 0;
    for (const program of WEEKLY_PROGRAMS) {
      const existing = await ctx.db
        .query("weeklyPrograms")
        .filter((q) => q.eq(q.field("title"), program.title))
        .first();
      if (!existing) {
        await ctx.db.insert("weeklyPrograms", {
          title: program.title,
          description: program.description,
          recurrence: "weekly",
          daysOfWeek: [...program.daysOfWeek],
          startDate: program.startDate,
          startTime: program.startTime,
          location: program.location,
          active: true,
          createdBy: admin._id,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }
    const total = (await ctx.db.query("weeklyPrograms").collect()).length;
    return { ok: true as const, created, total };
  },
});

/**
 * The cost register's reference rows: one per SRS §7 service (spec 0011,
 * AC-16), with the plan and published price each one is actually on.
 *
 * The prices here are the vendors' own list prices as of October 2026, for the
 * tier this platform runs on, and most of them are zero: the whole stack sits
 * on free tiers except the two app store accounts and the prepaid SMS credit.
 * That is the real finding this register exists to surface, and it is worth
 * more on the page than fourteen blank rows were.
 *
 * Four fields are deliberately left empty, because they are facts about this
 * church's accounts that no amount of research can supply: the Cloudflare
 * plan, the Caster.fm plan, the SMS credit balance, and the Apple renewal
 * anniversary. Those show as "not recorded", which is the honest state and a
 * short, visible to-do rather than four invented numbers.
 *
 * A figure is recorded here only where the price is a published constant the
 * church cannot be on a different version of. Anything metered (R2 past 10 GB,
 * Convex past the Starter limits) stays on its free tier row with its
 * allowance, because the bill for those is zero until it suddenly is not, and
 * the analytics page is where that is watched.
 *
 * Safe in every environment including production: it asserts no role, and it
 * fills only fields that are still empty, so a System Admin who has recorded a
 * real invoice amount always wins over this list. Idempotent — matched on
 * `serviceKey`, not on name, so a row that has since been renamed does not get
 * a duplicate.
 */
interface CostSeedRow {
  serviceKey: CostServiceKey;
  name: string;
  purpose: string;
  plan?: string;
  billingCycle?: BillingCycle;
  currency?: CostCurrency;
  /** Whole minor units, matching the currency's exponent. */
  amountMinor?: number;
  allowanceLimit?: number;
  consoleUrl?: string;
  notes?: string;
}

const COST_REGISTER_SEED: readonly CostSeedRow[] = [
  {
    serviceKey: "convex",
    name: "Convex",
    purpose: "Database, backend functions and scheduled jobs",
    plan: "Starter",
    billingCycle: "free_tier",
    consoleUrl: "https://dashboard.convex.dev",
    notes:
      "Professional is $25 per developer per month. Nothing here needs it yet; the nightly backup workflow covers what the paid plan would add.",
  },
  {
    serviceKey: "r2",
    name: "Cloudflare R2",
    purpose: "Photos, cover images, recordings and free Library files",
    plan: "Free (10 GB stored)",
    billingCycle: "free_tier",
    // Ten binary gigabytes, the unit the analytics page measures storage in.
    allowanceLimit: 10 * 1024 * 1024 * 1024,
    consoleUrl: "https://dash.cloudflare.com",
    notes:
      "Storage past 10 GB is about $0.015 per GB per month. Egress is free. Watch the storage figure on the analytics page.",
  },
  {
    serviceKey: "cloudflare_pages",
    name: "Cloudflare Pages",
    purpose: "Web portal hosting",
    consoleUrl: "https://dash.cloudflare.com",
    notes:
      "Confirm whether this account is on the free Workers plan or Workers Paid at $5 per month, then record it here.",
  },
  {
    serviceKey: "eas",
    name: "Expo (EAS)",
    purpose: "Mobile builds and over-the-air updates",
    plan: "Free",
    billingCycle: "free_tier",
    consoleUrl: "https://expo.dev/accounts",
    notes:
      "Free covers 15 Android and 15 iOS builds a month on the low priority queue, and updates for 1,000 monthly active users. Starter is $19 a month if the build queue becomes the bottleneck.",
  },
  {
    serviceKey: "push",
    name: "Push notifications (Apple and Google, via Expo)",
    purpose: "Push delivery",
    plan: "Included with Expo",
    billingCycle: "free_tier",
    consoleUrl: "https://expo.dev/accounts",
    notes: "Expo charges nothing for push, and neither Apple nor Google does.",
  },
  {
    serviceKey: "resend",
    name: "Resend",
    purpose: "The five system emails",
    plan: "Free (3,000 emails per month)",
    billingCycle: "free_tier",
    allowanceLimit: 3000,
    consoleUrl: "https://resend.com/emails",
    notes:
      "Also capped at 100 a day. Pro is $20 a month for 50,000. The analytics page counts what has actually been sent this month.",
  },
  {
    serviceKey: "africas_talking",
    name: "Africa's Talking",
    purpose: "Hospitality SMS",
    plan: "Prepaid credit",
    billingCycle: "prepaid_credit",
    currency: "UGX",
    consoleUrl: "https://account.africastalking.com",
    notes:
      "Topped up by Church Finance. Record the current balance here, in shillings, whenever it is topped up.",
  },
  {
    serviceKey: "google_cloud",
    name: "Google Cloud",
    purpose: "Google sign-in credentials and consent screen",
    plan: "Sign-in credentials only",
    billingCycle: "free_tier",
    consoleUrl: "https://console.cloud.google.com",
    notes:
      "OAuth credentials and the consent screen are free. This row costs nothing unless some other Google Cloud service is switched on.",
  },
  {
    serviceKey: "caster_fm",
    name: "Caster FM",
    purpose: "Radio stream",
    consoleUrl: "https://www.caster.fm",
    notes:
      "The church already runs this. Record the plan and price. Caster.fm has a discount programme for religious and community organisations, which is worth asking about.",
  },
  {
    serviceKey: "sentry",
    name: "Sentry",
    purpose: "Error and crash reporting",
    plan: "Developer (free)",
    billingCycle: "free_tier",
    consoleUrl: "https://sentry.io",
    notes:
      "SRS §7 records this as the free tier. The analytics page shows failed emails and links through to the console.",
  },
  {
    serviceKey: "youtube",
    name: "YouTube",
    purpose: "Past events: links and thumbnails",
    plan: "No account needed",
    billingCycle: "free_tier",
    notes:
      "Links and thumbnails only, so there is nothing to pay and no account to hold.",
  },
  {
    serviceKey: "giving",
    name: "MTN MoMo, Airtel Money and banks",
    purpose: "Giving outside the app",
    plan: "No platform cost",
    billingCycle: "free_tier",
    notes:
      "The app only displays the codes and numbers Finance enters. The platform pays nothing; any transaction charges are the giver's or the church's bank arrangement, not a service this platform subscribes to.",
  },
  {
    serviceKey: "app_store",
    name: "Apple App Store Connect",
    purpose: "iPhone distribution and TestFlight",
    plan: "Apple Developer Program",
    billingCycle: "annual",
    currency: "USD",
    amountMinor: 9900,
    consoleUrl: "https://appstoreconnect.apple.com",
    notes:
      "Renews on the enrolment anniversary; record that date to switch the reminders on. Apple waives the fee for non-profits in eligible countries, which is worth checking.",
  },
  {
    serviceKey: "play_console",
    name: "Google Play Console",
    purpose: "Android distribution and closed testing",
    plan: "Developer registration",
    billingCycle: "one_time",
    currency: "USD",
    amountMinor: 2500,
    consoleUrl: "https://play.google.com/console",
    notes:
      "Paid once, never again. There is no recurring Play Console fee for the account itself.",
  },
];

export const costServices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const email = process.env.SEED_ADMIN_EMAIL;
    if (!email) return { ok: false as const, reason: "SEED_ADMIN_EMAIL not set" };
    const admin = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!admin) {
      return { ok: false as const, reason: "no SEED_ADMIN_EMAIL user yet" };
    }

    const now = Date.now();
    let created = 0;
    let filled = 0;

    for (const service of COST_REGISTER_SEED) {
      // Archived rows are skipped, the way `serviceByKey` skips them. An
      // archived Resend row must not absorb this seed: patching it would
      // leave the live register permanently missing that service, and
      // `updateService` forbids editing an archived row anyway, so writing to
      // one here would contradict the rule a page away.
      const existing = (
        await ctx.db
          .query("costServices")
          .withIndex("by_serviceKey", (q) =>
            q.eq("serviceKey", service.serviceKey)
          )
          .collect()
      ).find((row) => row.archivedAt === undefined);

      if (!existing) {
        await ctx.db.insert("costServices", {
          name: service.name,
          serviceKey: service.serviceKey,
          purpose: service.purpose,
          ...(service.plan === undefined ? {} : { plan: service.plan }),
          ...(service.billingCycle === undefined
            ? {}
            : { billingCycle: service.billingCycle }),
          ...(service.currency === undefined
            ? {}
            : { currency: service.currency }),
          ...(service.amountMinor === undefined
            ? {}
            : { amountMinor: service.amountMinor }),
          ...(service.allowanceLimit === undefined
            ? {}
            : { allowanceLimit: service.allowanceLimit }),
          ...(service.consoleUrl === undefined
            ? {}
            : { consoleUrl: service.consoleUrl }),
          ...(service.notes === undefined ? {} : { notes: service.notes }),
          createdBy: admin._id,
          createdAt: now,
          updatedAt: now,
        });
        created++;
        continue;
      }

      // Fill what is still empty; never overwrite. Somebody who has read the
      // real invoice always beats this list, which is a starting point rather
      // than an authority — and that is precisely what keeps re-running this
      // safe in production (AC-16).
      const patch: {
        plan?: string;
        billingCycle?: BillingCycle;
        currency?: CostCurrency;
        amountMinor?: number;
        allowanceLimit?: number;
        consoleUrl?: string;
        notes?: string;
      } = {};

      if (existing.plan === undefined && service.plan !== undefined) {
        patch.plan = service.plan;
      }
      if (
        existing.billingCycle === undefined &&
        service.billingCycle !== undefined
      ) {
        patch.billingCycle = service.billingCycle;
      }
      if (existing.currency === undefined && service.currency !== undefined) {
        patch.currency = service.currency;
      }
      if (
        existing.amountMinor === undefined &&
        service.amountMinor !== undefined
      ) {
        patch.amountMinor = service.amountMinor;
      }
      if (
        existing.allowanceLimit === undefined &&
        service.allowanceLimit !== undefined
      ) {
        patch.allowanceLimit = service.allowanceLimit;
      }
      if (
        existing.consoleUrl === undefined &&
        service.consoleUrl !== undefined
      ) {
        patch.consoleUrl = service.consoleUrl;
      }
      if (existing.notes === undefined && service.notes !== undefined) {
        patch.notes = service.notes;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
        filled++;
      }
    }

    const total = (await ctx.db.query("costServices").collect()).length;
    return { ok: true as const, created, filled, total };
  },
});
