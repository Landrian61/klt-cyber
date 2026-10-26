import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  getSystemAdminOrNull,
  requireSystemAdmin,
  logActivity,
} from "./lib/authz";
import {
  vBillingCycle,
  vCostCurrency,
  vCostServiceKey,
} from "./lib/costValidators";
import { kampalaDateKey } from "./calendar";
import { usdToUgxRate } from "./exchangeRates";
import {
  COST_HELD_BY_MAX,
  COST_NAME_MAX,
  COST_NOTES_MAX,
  COST_PLAN_MAX,
  COST_PURPOSE_MAX,
  OVERDUE_NOTICE_MAX_DAYS,
  RENEWAL_REMINDER_STAGES,
  advanceRenewalDate,
  cycleRequiresRenewalDate,
  daysBetweenDateKeys,
  formatCostAmount,
  isHttpsUrl,
  isValidDateKey,
  monthlyContributionMinor,
  renewalStateFor,
  type BillingCycle,
  type CostCurrency,
  type CostServiceKey,
  type RenewalReminderStage,
} from "@klt-cyber/shared";

/**
 * The cost register (spec 0011, SRS A8-05 and F3-17).
 *
 * One row per external service the church pays for, maintained by hand by a
 * System Admin. Three rules shape this file:
 *
 *  - **Money is always a whole number of minor units.** Validated on write,
 *    formatted only on display. No amount is ever stored or computed as a
 *    fraction, which is what keeps the per-row figures adding up to the total.
 *  - **No cross-currency arithmetic anywhere.** The monthly total is a map
 *    keyed by currency, never a single number, because the church has no rate
 *    to convert at and a wrong one would be worse than two honest figures.
 *  - **Nothing is ever deleted.** Archiving removes a row from the totals and
 *    the reminder sweep and leaves it readable, because "what did we used to
 *    pay for" is a question somebody will eventually ask.
 */

// ── Validation ────────────────────────────────────────────────────────────

/** The fields a System Admin may set, shared by create and update. */
const serviceFields = {
  name: v.optional(v.string()),
  serviceKey: v.optional(vCostServiceKey),
  purpose: v.optional(v.string()),
  plan: v.optional(v.string()),
  amountMinor: v.optional(v.number()),
  currency: v.optional(vCostCurrency),
  billingCycle: v.optional(vBillingCycle),
  renewalDate: v.optional(v.string()),
  allowanceLimit: v.optional(v.number()),
  consoleUrl: v.optional(v.string()),
  accountHeldBy: v.optional(v.string()),
  notes: v.optional(v.string()),
};

/**
 * The optional fields an edit can empty again.
 *
 * This list exists because Convex drops object keys whose value is `undefined`
 * before the arguments ever reach the server, so `amountMinor: undefined` and
 * "amountMinor was not sent" are the same thing on this side. A text field can
 * say "" to mean emptied; a number, a currency or a cycle has no such value,
 * so the client names the fields it is clearing instead. Without this an
 * amount or a renewal date could be set once and never taken back.
 */
export const CLEARABLE_FIELDS = [
  "amountMinor",
  "currency",
  "billingCycle",
  "renewalDate",
  "allowanceLimit",
] as const;

export type ClearableField = (typeof CLEARABLE_FIELDS)[number];

/** Reject anything not on the list, so `clear` can never blank `name`. */
function clearedSet(clear: string[] | undefined): Set<ClearableField> {
  const result = new Set<ClearableField>();
  for (const field of clear ?? []) {
    if (!(CLEARABLE_FIELDS as readonly string[]).includes(field)) {
      throw new Error(`${field} cannot be cleared`);
    }
    result.add(field as ClearableField);
  }
  return result;
}

const TEXT_CAPS: Record<string, number> = {
  name: COST_NAME_MAX,
  plan: COST_PLAN_MAX,
  purpose: COST_PURPOSE_MAX,
  accountHeldBy: COST_HELD_BY_MAX,
  notes: COST_NOTES_MAX,
};

/** A non-negative whole number, the only shape money is allowed to take. */
function assertWholeNonNegative(label: string, value: number | undefined) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number of zero or more`);
  }
}

/**
 * Validate one write and return the trimmed values to store.
 *
 * `existing` is the row being edited, so an update can check the merged result
 * rather than the patch alone: clearing a cycle and setting a renewal date in
 * two separate edits must not be able to reach a state a single edit would
 * have been refused.
 */
async function validateServiceWrite(
  ctx: MutationCtx,
  input: {
    name?: string;
    purpose?: string;
    plan?: string;
    amountMinor?: number;
    currency?: CostCurrency;
    billingCycle?: BillingCycle;
    renewalDate?: string;
    allowanceLimit?: number;
    consoleUrl?: string;
    accountHeldBy?: string;
    notes?: string;
  },
  existing: Doc<"costServices"> | null,
  /** Fields this write is emptying; see CLEARABLE_FIELDS. */
  cleared: Set<ClearableField> = new Set()
) {
  const trimmed: Record<string, string | undefined> = {};
  for (const [field, cap] of Object.entries(TEXT_CAPS)) {
    const raw = input[field as keyof typeof input];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (value.length > cap) {
      throw new Error(`${field} must be ${cap} characters or fewer`);
    }
    // An emptied optional field is cleared rather than stored as "".
    trimmed[field] = value.length === 0 ? undefined : value;
  }

  const name = trimmed.name ?? existing?.name;
  if (!name) throw new Error("A service needs a name");

  // Convex has no unique indexes, so uniqueness is enforced here, the way
  // convex/AGENTS.md requires. Compared after trimming and lowercasing,
  // because "Resend " and "resend" are the same service to everyone except a
  // string comparison. Archived rows are excluded: an old Resend row that was
  // archived must not block a new one.
  const key = name.trim().toLowerCase();
  const siblings = await ctx.db
    .query("costServices")
    .withIndex("by_archivedAt", (q) => q.eq("archivedAt", undefined))
    .collect();
  const clash = siblings.find(
    (row) => row._id !== existing?._id && row.name.trim().toLowerCase() === key
  );
  if (clash) throw new Error(`A service named "${name}" already exists`);

  assertWholeNonNegative("amountMinor", input.amountMinor);
  assertWholeNonNegative("allowanceLimit", input.allowanceLimit);

  if (input.consoleUrl !== undefined && input.consoleUrl.trim().length > 0) {
    // https only, because both pages render this straight into an anchor.
    if (!isHttpsUrl(input.consoleUrl.trim())) {
      throw new Error("The console link must be an https:// address");
    }
  }

  // The cycle and date are checked against the merged result, not the patch,
  // and a field being cleared merges as absent — otherwise clearing a cycle
  // would still be validated against the one it is replacing.
  const billingCycle = cleared.has("billingCycle")
    ? undefined
    : "billingCycle" in input
      ? input.billingCycle
      : existing?.billingCycle;
  const renewalDate = cleared.has("renewalDate")
    ? undefined
    : "renewalDate" in input
      ? input.renewalDate
      : existing?.renewalDate;

  // A renewal date is allowed only on a cycle that renews, but it is not
  // demanded by one. Knowing a service costs $99 a year without yet knowing
  // the anniversary is an ordinary state, and the earlier rule forced a choice
  // between inventing a date and recording no cost at all. The sweep already
  // skips a row with no date, so the only thing this costs is the reminder,
  // which is exactly what is missing anyway.
  if (renewalDate !== undefined && renewalDate.length > 0) {
    if (!isValidDateKey(renewalDate)) {
      throw new Error("The renewal date must be a real date (YYYY-MM-DD)");
    }
    if (billingCycle !== undefined && !cycleRequiresRenewalDate(billingCycle)) {
      throw new Error(
        "Only a monthly or annual service has a renewal date. A one-time fee, free tier, prepaid credit or pay-as-you-go service does not renew."
      );
    }
  }

  return {
    name,
    purpose: trimmed.purpose,
    plan: trimmed.plan,
    accountHeldBy: trimmed.accountHeldBy,
    notes: trimmed.notes,
    consoleUrl:
      input.consoleUrl === undefined || input.consoleUrl.trim().length === 0
        ? undefined
        : input.consoleUrl.trim(),
  };
}

// ── Reads ─────────────────────────────────────────────────────────────────

/**
 * The register, with each row's derived renewal state and the monthly total
 * per currency.
 *
 * Returns the whole set rather than paginating, which is deliberate and
 * bounded: this table holds one row per external service, and the only
 * automatic writer is a one-time seed of fourteen. That is an invariant of
 * the feature, not an assumption about growth.
 */
export const listServices = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { includeArchived }) => {
    // Null when unauthenticated, so a live subscription outlasts sign-out —
    // the same convention convex/admin.ts:getDashboardStats follows.
    if (!(await getSystemAdminOrNull(ctx))) return null;

    const all = await ctx.db.query("costServices").collect();
    const services = includeArchived
      ? all
      : all.filter((row) => row.archivedAt === undefined);

    const todayKey = kampalaDateKey(Date.now());

    const rows = services
      .map((service) => {
        const monthlyMinor = monthlyContributionMinor(
          service.amountMinor,
          service.billingCycle
        );
        return {
          ...service,
          // Derived at read time, never stored, so it cannot disagree with
          // the date it comes from.
          renewalState:
            service.archivedAt === undefined && service.renewalDate
              ? renewalStateFor(service.renewalDate, todayKey)
              : null,
          daysUntilRenewal: service.renewalDate
            ? daysBetweenDateKeys(todayKey, service.renewalDate)
            : null,
          // Rounded per row before summing, so the figures shown on the rows
          // add up to exactly the total shown beneath them.
          monthlyMinor,
          // A row with no cycle, currency or amount is listed rather than
          // hidden, and joins no total: an unfilled seeded row should be
          // visibly unfilled, not silently absent.
          costRecorded:
            service.amountMinor !== undefined &&
            service.currency !== undefined &&
            service.billingCycle !== undefined,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Keyed by currency. There is no cross-currency arithmetic anywhere in
    // this feature, and this map is the shape that makes adding one awkward.
    const monthlyTotalsByCurrency: Record<string, number> = {};
    for (const row of rows) {
      if (row.archivedAt !== undefined) continue; // archived joins no total
      if (!row.currency || row.monthlyMinor === 0) continue;
      monthlyTotalsByCurrency[row.currency] =
        (monthlyTotalsByCurrency[row.currency] ?? 0) + row.monthlyMinor;
    }

    // The rate travels with the figures rather than being fetched separately
    // by the page, so a card and the rate beneath it can never come from two
    // different moments. Null until the daily job has run once, which the page
    // renders as "rate not available yet" rather than inventing one.
    const usdToUgx = await usdToUgxRate(ctx);

    return { services: rows, monthlyTotalsByCurrency, todayKey, usdToUgx };
  },
});

// ── Writes ────────────────────────────────────────────────────────────────

export const createService = mutation({
  args: serviceFields,
  handler: async (ctx, args) => {
    const admin = await requireSystemAdmin(ctx);
    const clean = await validateServiceWrite(ctx, args, null);

    const now = Date.now();
    const serviceId = await ctx.db.insert("costServices", {
      name: clean.name,
      ...(args.serviceKey !== undefined ? { serviceKey: args.serviceKey } : {}),
      ...(clean.purpose !== undefined ? { purpose: clean.purpose } : {}),
      ...(clean.plan !== undefined ? { plan: clean.plan } : {}),
      ...(args.amountMinor !== undefined
        ? { amountMinor: args.amountMinor }
        : {}),
      ...(args.currency !== undefined ? { currency: args.currency } : {}),
      ...(args.billingCycle !== undefined
        ? { billingCycle: args.billingCycle }
        : {}),
      ...(args.renewalDate ? { renewalDate: args.renewalDate } : {}),
      ...(args.allowanceLimit !== undefined
        ? { allowanceLimit: args.allowanceLimit }
        : {}),
      ...(clean.consoleUrl !== undefined
        ? { consoleUrl: clean.consoleUrl }
        : {}),
      ...(clean.accountHeldBy !== undefined
        ? { accountHeldBy: clean.accountHeldBy }
        : {}),
      ...(clean.notes !== undefined ? { notes: clean.notes } : {}),
      createdBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      actorUserId: admin._id,
      action: "cost.service_added",
      targetType: "costService",
      targetId: serviceId,
      // The service's name, never its amount. Copying figures here would
      // turn the audit trail into a second cost record that drifts from the
      // first, and the register itself is already the record.
      metadata: { name: clean.name },
    });

    return serviceId;
  },
});

export const updateService = mutation({
  args: {
    serviceId: v.id("costServices"),
    ...serviceFields,
    // Names the optional fields this edit is emptying. See CLEARABLE_FIELDS
    // for why sending `undefined` cannot say this.
    clear: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { serviceId, clear, ...args }) => {
    const admin = await requireSystemAdmin(ctx);
    const service = await ctx.db.get(serviceId);
    if (!service) throw new Error("That service no longer exists");
    if (service.archivedAt !== undefined) {
      // An archived row is a record of what was, not a live one. Editing it
      // would quietly rewrite history; un-archiving is the honest way back
      // and is deliberately not in this feature (see the spec's Follow-up).
      throw new Error("An archived service cannot be edited");
    }

    const cleared = clearedSet(clear);
    const clean = await validateServiceWrite(ctx, args, service, cleared);

    // Only fields the caller actually sent are touched, so a form that posts
    // three fields cannot blank the other nine.
    const patch: Partial<Doc<"costServices">> = { updatedAt: Date.now() };
    const changed: string[] = [];
    const set = <K extends keyof Doc<"costServices">>(
      field: K,
      value: Doc<"costServices">[K]
    ) => {
      if (service[field] === value) return;
      patch[field] = value;
      changed.push(String(field));
    };

    if ("name" in args) set("name", clean.name);
    if ("serviceKey" in args) set("serviceKey", args.serviceKey);
    if ("purpose" in args) set("purpose", clean.purpose);
    if ("plan" in args) set("plan", clean.plan);
    if ("amountMinor" in args) set("amountMinor", args.amountMinor);
    if ("currency" in args) set("currency", args.currency);
    if ("billingCycle" in args) set("billingCycle", args.billingCycle);
    if ("renewalDate" in args) {
      set("renewalDate", args.renewalDate || undefined);
    }
    if ("allowanceLimit" in args) set("allowanceLimit", args.allowanceLimit);
    if ("consoleUrl" in args) set("consoleUrl", clean.consoleUrl);
    if ("accountHeldBy" in args) set("accountHeldBy", clean.accountHeldBy);
    if ("notes" in args) set("notes", clean.notes);

    // Applied after the sets above, so naming a field in `clear` always wins
    // over a value that arrived for the same field in the same call.
    if (cleared.has("amountMinor")) set("amountMinor", undefined);
    if (cleared.has("currency")) set("currency", undefined);
    if (cleared.has("billingCycle")) set("billingCycle", undefined);
    if (cleared.has("renewalDate")) set("renewalDate", undefined);
    if (cleared.has("allowanceLimit")) set("allowanceLimit", undefined);

    await ctx.db.patch(serviceId, patch);

    await logActivity(ctx, {
      actorUserId: admin._id,
      action: "cost.service_updated",
      targetType: "costService",
      targetId: serviceId,
      // The names of what changed, not the values. Enough to answer "who
      // moved the renewal date", without copying money into a second place.
      metadata: { name: clean.name, changed },
    });

    return null;
  },
});

/**
 * Record that a renewing service has renewed, advancing its date by its cycle.
 *
 * Moving the date forward also re-arms all three reminder stages for free,
 * because the renewal date is part of the notice key — there is no separate
 * "reset the reminders" step that could be forgotten.
 */
export const markRenewed = mutation({
  args: { serviceId: v.id("costServices") },
  handler: async (ctx, { serviceId }) => {
    const admin = await requireSystemAdmin(ctx);
    const service = await ctx.db.get(serviceId);
    if (!service) throw new Error("That service no longer exists");
    if (service.archivedAt !== undefined) {
      throw new Error("An archived service cannot be renewed");
    }
    if (!service.billingCycle || !cycleRequiresRenewalDate(service.billingCycle)) {
      throw new Error("Only a monthly or annual service renews");
    }
    if (!service.renewalDate) {
      throw new Error("That service has no renewal date to move on from");
    }

    const renewalDate = advanceRenewalDate(
      service.renewalDate,
      service.billingCycle
    );
    await ctx.db.patch(serviceId, { renewalDate, updatedAt: Date.now() });

    await logActivity(ctx, {
      actorUserId: admin._id,
      action: "cost.service_renewed",
      targetType: "costService",
      targetId: serviceId,
      metadata: { name: service.name, renewalDate },
    });

    return renewalDate;
  },
});

export const archiveService = mutation({
  args: { serviceId: v.id("costServices") },
  handler: async (ctx, { serviceId }) => {
    const admin = await requireSystemAdmin(ctx);
    const service = await ctx.db.get(serviceId);
    if (!service) throw new Error("That service no longer exists");
    if (service.archivedAt !== undefined) {
      throw new Error("That service is already archived");
    }

    // Kept, not deleted: out of the totals and out of the sweep, still
    // readable under the archived view.
    await ctx.db.patch(serviceId, {
      archivedAt: Date.now(),
      archivedBy: admin._id,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      actorUserId: admin._id,
      action: "cost.service_archived",
      targetType: "costService",
      targetId: serviceId,
      metadata: { name: service.name },
    });

    return null;
  },
});

// ── Renewal reminders ─────────────────────────────────────────────────────

/** The notification text for one stage of one service. */
function noticeText(
  service: Doc<"costServices">,
  stage: RenewalReminderStage,
  overdueDays: number
): { title: string; body: string } {
  const amount =
    service.amountMinor !== undefined && service.currency !== undefined
      ? formatCostAmount(service.amountMinor, service.currency)
      : null;
  const cost = amount ? ` (${amount})` : "";

  if (stage === "t14") {
    return {
      title: `Renewal in 14 days: ${service.name}`,
      body: `${service.name}${cost} renews on ${service.renewalDate}.`,
    };
  }
  if (stage === "t3") {
    return {
      title: `Renewal in 3 days: ${service.name}`,
      body: `${service.name}${cost} renews on ${service.renewalDate}.`,
    };
  }
  if (overdueDays > 0) {
    return {
      title: `Renewal overdue: ${service.name}`,
      body: `${service.name}${cost} was due to renew on ${service.renewalDate}, ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago.`,
    };
  }
  return {
    title: `Renews today: ${service.name}`,
    body: `${service.name}${cost} renews today, ${service.renewalDate}.`,
  };
}

/**
 * The daily renewal sweep (spec 0011, AC-14 and AC-15).
 *
 * Each stage is a threshold, not an exact day: "14 days or fewer and not yet
 * notified" rather than "exactly 14 days away". That is what makes a sweep
 * that missed a run fire the notice once and late instead of losing it, and
 * what makes a renewal date first typed in while already inside the window
 * fire at all.
 *
 * Idempotency is a row in `costRenewalNotices`, not timing. The notice is
 * written and the send scheduled inside the same mutation, so the record and
 * the send commit together and a retried mutation cannot double-send.
 */
export const checkRenewalReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const todayKey = kampalaDateKey(Date.now());

    // Only live rows: archiving stops the sweep, which is the point of it.
    const services = await ctx.db
      .query("costServices")
      .withIndex("by_archivedAt", (q) => q.eq("archivedAt", undefined))
      .collect();

    for (const service of services) {
      if (!service.renewalDate) continue;
      if (!service.billingCycle || !cycleRequiresRenewalDate(service.billingCycle)) {
        continue;
      }

      const daysAway = daysBetweenDateKeys(todayKey, service.renewalDate);
      const overdueDays = daysAway < 0 ? -daysAway : 0;

      const notices = await ctx.db
        .query("costRenewalNotices")
        .withIndex("by_service_renewal_stage", (q) =>
          q.eq("serviceId", service._id).eq("renewalDate", service.renewalDate!)
        )
        .collect();

      // The nearest stage that applies, so a service entered three days out
      // sends one "in 3 days" notice rather than that plus a late "in 14
      // days" the same morning.
      const stage = pickStage(daysAway, notices, todayKey);
      if (!stage) continue;

      if (stage === "due" && overdueDays > OVERDUE_NOTICE_MAX_DAYS) {
        // The row stays marked overdue on the page; it just stops nudging.
        continue;
      }

      const { title, body } = noticeText(service, stage, overdueDays);

      await ctx.db.insert("costRenewalNotices", {
        serviceId: service._id,
        renewalDate: service.renewalDate,
        stage,
        noticeDate: todayKey,
        sentAt: Date.now(),
      });

      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        title,
        body,
        // Resolved at send time, so a System Admin appointed yesterday is
        // included and one whose role was revoked is not.
        audience: { type: "role", roleType: "system_admin" },
        // Written now, resolved later: nothing in apps/admin reads deepLink
        // yet, because the web bell is feature 28's to build. On mobile,
        // resolveDeepLinkHref returns null for an unknown type, which is the
        // right outcome for a portal-only notice.
        deepLink: { type: "costService", id: service._id },
        // A cron has no acting user, so the notice is attributed to whoever
        // created the service — the pattern convex/weeklyPrograms.ts uses.
        createdBy: service.createdBy,
      });
    }

    return null;
  },
});

/**
 * The stages nearest first. `RENEWAL_REMINDER_STAGES` is declared farthest
 * first because that is how somebody reads a reminder schedule, and picking a
 * stage has to walk it the other way round.
 */
const STAGES_NEAREST_FIRST = [...RENEWAL_REMINDER_STAGES].sort(
  (a, b) => a.daysBefore - b.daysBefore
);

/**
 * Which stage, if any, is due for this service today.
 *
 * The stage is always the *nearest* one that applies, and never a farther one.
 * A service recorded three days before it renews gets one "in 3 days" notice:
 * not that plus a late "in 14 days", which would be a sentence contradicted by
 * the date printed inside it. If the nearest applicable stage has already gone
 * out, nothing is sent, rather than falling back to a stage whose moment has
 * passed.
 *
 * `t14` and `t3` are keyed on the stage alone, so each fires once per renewal
 * date and never again. `due` is keyed on the stage *and* the date it went
 * out, which is what lets it repeat once a calendar day while a renewal is
 * overdue without either of the other two ever repeating.
 */
export function pickStage(
  daysAway: number,
  // Structural rather than the whole document: these are the only two fields
  // the decision reads, and saying so makes it testable without a database.
  notices: { stage: RenewalReminderStage; noticeDate: string }[],
  todayKey: string
): RenewalReminderStage | null {
  // Thresholds, not equalities: a sweep that did not run on the exact day
  // still fires the notice late rather than losing it.
  const applicable = STAGES_NEAREST_FIRST.find(
    ({ daysBefore }) => daysAway <= daysBefore
  );
  if (!applicable) return null;

  if (applicable.stage === "due") {
    const alreadyToday = notices.some(
      (n) => n.stage === "due" && n.noticeDate === todayKey
    );
    return alreadyToday ? null : "due";
  }

  const sent = notices.some((n) => n.stage === applicable.stage);
  return sent ? null : applicable.stage;
}

/** Look up one service by its `serviceKey`, for the analytics page's links. */
export async function serviceByKey(
  ctx: QueryCtx,
  serviceKey: CostServiceKey
): Promise<Doc<"costServices"> | null> {
  const rows = await ctx.db
    .query("costServices")
    .withIndex("by_serviceKey", (q) => q.eq("serviceKey", serviceKey))
    .collect();
  // Archived rows are skipped: a link to a console the church has stopped
  // paying for is worse than no link.
  return rows.find((row) => row.archivedAt === undefined) ?? null;
}

/** Narrowing helper kept beside the table it describes. */
export type CostServiceId = Id<"costServices">;
