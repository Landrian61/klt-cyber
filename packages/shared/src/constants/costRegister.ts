/**
 * The cost register and platform analytics contract (spec 0011).
 *
 * This file exists because three consumers have to agree on exactly the same
 * numbers and rules: the Convex mutations that validate a write, the portal
 * form that prepares one, and the portal page that renders the totals back.
 * A money rule defined privately inside a mutation cannot be tested from the
 * form, and a rounding rule defined twice is a rounding rule that will drift.
 *
 * Nothing here imports React, React Native or Convex — all three load it.
 */

import { isValidDateKey } from "../schemas/dateKey";

// ── Services ──────────────────────────────────────────────────────────────

/**
 * Every external service the church pays for or depends on, one key per row
 * of `spec/SRS.md` §7.
 *
 * Fourteen keys for SRS §7's thirteen rows: that table lists the two app
 * stores together, and they are two accounts with two costs and two consoles.
 *
 * These keys are how a page finds a specific service without matching on a
 * name a System Admin may have edited since. The Devices section reads the
 * `play_console` and `app_store` rows' console URLs, Health reads `sentry`'s,
 * and the email allowance reads `resend`'s.
 */
export const COST_SERVICE_KEYS = [
  "convex",
  "r2",
  "cloudflare_pages",
  "eas",
  "push",
  "resend",
  "africas_talking",
  "google_cloud",
  "caster_fm",
  "sentry",
  "youtube",
  "giving",
  "app_store",
  "play_console",
] as const;

export type CostServiceKey = (typeof COST_SERVICE_KEYS)[number];

/**
 * Which of our own counts belongs beside a service on the analytics page.
 *
 * The unit of `allowanceLimit` is implied by this map rather than stored as a
 * second field, so there is no way for a row to carry an allowance in one unit
 * and a label claiming another. A service absent from this map simply shows no
 * usage figure.
 */
export const SERVICE_USAGE_METRIC = {
  resend: "emailsThisMonth",
  r2: "storageBytes",
  africas_talking: "smsCredit",
} as const satisfies Partial<Record<CostServiceKey, string>>;

export type ServiceUsageMetric =
  (typeof SERVICE_USAGE_METRIC)[keyof typeof SERVICE_USAGE_METRIC];

// ── Money ─────────────────────────────────────────────────────────────────

/**
 * The currencies the register accepts, each with the exponent that turns a
 * minor unit into a major one.
 *
 * The Uganda shilling has no subunit in practice, so its exponent is 0: an
 * `amountMinor` of 50000 is UGX 50,000, not UGX 500.00.
 *
 * A stored amount is never converted. What a service bills in is what the
 * register holds, and the UGX figure shown beside a dollar cost is a reading
 * aid computed at render time from a dated rate (see `convertUsdMinorToUgx`),
 * never written back. That split is deliberate: the moment a converted figure
 * is stored, nobody can tell afterwards which number the invoice actually
 * said.
 */
export const COST_CURRENCIES = {
  USD: { exponent: 2, symbol: "$" },
  UGX: { exponent: 0, symbol: "USh" },
} as const;

export type CostCurrency = keyof typeof COST_CURRENCIES;

export const COST_CURRENCY_CODES = Object.keys(
  COST_CURRENCIES
) as CostCurrency[];

/** True only for a currency code the register accepts. */
export function isCostCurrency(value: string): value is CostCurrency {
  return value in COST_CURRENCIES;
}

/**
 * A whole number of minor units rendered as money, e.g. 2499 USD → "$24.99",
 * 50000 UGX → "USh 50,000".
 *
 * The only place a stored amount becomes a string. Grouping comes from
 * `en-US` rather than the runtime default so the portal renders the same
 * figure whatever locale the browser reports.
 */
export function formatCostAmount(
  amountMinor: number,
  currency: CostCurrency
): string {
  const { exponent, symbol } = COST_CURRENCIES[currency];
  const major = amountMinor / 10 ** exponent;
  const formatted = major.toLocaleString("en-US", {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  return exponent === 0 ? `${symbol} ${formatted}` : `${symbol}${formatted}`;
}

/** Minor units from what a System Admin typed, e.g. 24.99 USD → 2499. */
export function costAmountToMinor(
  majorAmount: number,
  currency: CostCurrency
): number {
  return Math.round(majorAmount * 10 ** COST_CURRENCIES[currency].exponent);
}

/** Minor units back into the major number a form field shows. */
export function costAmountToMajor(
  amountMinor: number,
  currency: CostCurrency
): number {
  return amountMinor / 10 ** COST_CURRENCIES[currency].exponent;
}

// ── Exchange rate ─────────────────────────────────────────────────────────

/**
 * What the register knows about the dollar, refreshed once a day.
 *
 * Deliberately a value passed around rather than a module level number: a rate
 * is only meaningful next to the moment it was read, and a bare constant would
 * lose that and go quietly stale.
 */
export interface UsdToUgxRate {
  /** Shillings per dollar, e.g. 4336.26. */
  rate: number;
  /** When the figure was fetched, shown next to every converted number. */
  fetchedAt: number;
  /** Who said so, shown once at the foot of the page. */
  source: string;
}

/**
 * How old a rate may be before the page stops presenting it as current.
 *
 * Three days rather than one: the source refreshes daily, so a single missed
 * fetch is a blip and not worth shouting about, but a rate that has sat still
 * across a long weekend has probably stopped arriving and the reader should be
 * told before they quote a shilling figure at a meeting.
 */
export const FX_RATE_STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function isFxRateStale(fetchedAt: number, now: number): boolean {
  return now - fetchedAt > FX_RATE_STALE_AFTER_MS;
}

/**
 * A dollar amount in cents as whole shillings.
 *
 * Exact, because every converted figure on the page has to add up the same way
 * the dollar figures do. Blunting the number for display is a separate step,
 * `roundUgxForDisplay`, so a total is summed from exact parts and rounded once
 * at the end rather than accumulating a rounding error per card.
 */
export function convertUsdMinorToUgx(usdMinor: number, rate: number): number {
  return Math.round((usdMinor / 100) * rate);
}

/**
 * A shilling amount as dollar cents, the same conversion the other way.
 *
 * Here so the prepaid SMS credit, the one figure the church holds in its own
 * currency, reads alongside the dollar costs rather than being the single row
 * a reader has to convert in their head.
 */
export function convertUgxToUsdMinor(ugx: number, rate: number): number {
  return Math.round((ugx / rate) * 100);
}

/**
 * A converted figure blunted to a precision it has actually earned.
 *
 * A rate that moves by tens of shillings a day cannot support a figure quoted
 * to the shilling: "USh 429,347" claims a precision the underlying rate does
 * not have, while "USh 429,300" reads as what it is, an estimate. Rounding is
 * always to the nearest step rather than down, so a converted total still sits
 * where the parts put it.
 */
export function roundUgxForDisplay(ugx: number): number {
  const step = ugx >= 10_000 ? 100 : ugx >= 1_000 ? 10 : 1;
  return Math.round(ugx / step) * step;
}

// ── Billing cycles ────────────────────────────────────────────────────────

export const BILLING_CYCLES = [
  "monthly",
  "annual",
  "one_time",
  "prepaid_credit",
  "free_tier",
  "pay_as_you_go",
] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** How each cycle reads on the page. */
export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Monthly",
  annual: "Annual",
  one_time: "One time",
  prepaid_credit: "Prepaid credit",
  free_tier: "Free tier",
  pay_as_you_go: "Pay as you go",
};

/**
 * The two cycles that renew on a date, and therefore require one.
 *
 * The other four are rejected if given a renewal date: a free tier does not
 * renew, prepaid credit runs down rather than renewing, pay as you go has no
 * cycle to land on, and a one time fee is paid once and never again. Storing a
 * date against any of them would put a confident, meaningless reminder in a
 * System Admin's pocket.
 */
export const CYCLES_REQUIRING_RENEWAL_DATE: readonly BillingCycle[] = [
  "monthly",
  "annual",
];

export function cycleRequiresRenewalDate(cycle: BillingCycle): boolean {
  return CYCLES_REQUIRING_RENEWAL_DATE.includes(cycle);
}

/**
 * What one service contributes to the monthly total, in minor units.
 *
 * An annual cost contributes one twelfth, rounded to the nearest minor unit
 * here rather than at the end, so each row's displayed monthly figure adds up
 * to exactly the total shown beside it. The four non renewing cycles
 * contribute nothing while still showing their own figure on their card.
 *
 * A one time fee is deliberately among them. Amortising the Play Console's $25
 * over some invented number of months would put a number on the page that no
 * month's spending will ever match.
 *
 * Returns 0 when either argument is absent, which is what makes a freshly
 * seeded row with no amount and no cycle join no total.
 */
export function monthlyContributionMinor(
  amountMinor: number | undefined,
  cycle: BillingCycle | undefined
): number {
  if (amountMinor === undefined || cycle === undefined) return 0;
  if (cycle === "monthly") return amountMinor;
  if (cycle === "annual") return Math.round(amountMinor / 12);
  return 0;
}

/**
 * The next renewal date after `dateKey` for a cycle that renews.
 *
 * A day of the month the target month does not have is clamped to that
 * month's last day, which is how every subscription biller behaves: 31 January
 * renewing monthly lands on 28 (or 29) February, not on 3 March. The clamp
 * does not carry forward, because it reads the stored date each time rather
 * than accumulating, so a date moved back to the 28th stays on the 28th.
 *
 * Returns the date unchanged for a cycle that does not renew, so a caller that
 * forgets to check cannot silently invent a date.
 */
export function advanceRenewalDate(
  dateKey: string,
  cycle: BillingCycle
): string {
  if (!cycleRequiresRenewalDate(cycle)) return dateKey;

  const [year, month, day] = dateKey.split("-").map(Number);
  const rollsYear = month === 12;
  const targetYear =
    cycle === "annual" ? year + 1 : rollsYear ? year + 1 : year;
  const targetMonth = cycle === "annual" ? month : rollsYear ? 1 : month + 1;

  // Day 0 of the month after the target is the target month's last day.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${targetYear}-${pad(targetMonth)}-${pad(targetDay)}`;
}

/** Re-exported so a consumer validating a renewal date needs one import. */
export { isValidDateKey };

// ── Renewal reminders ─────────────────────────────────────────────────────

/**
 * How many days before a renewal each reminder stage fires, nearest last.
 *
 * Read as thresholds, never as equalities: a sweep that did not run on the day
 * a service was exactly 14 days out must still fire that notice the next day,
 * late, rather than losing it. The same applies to a renewal date first typed
 * in while already inside the window.
 */
export const RENEWAL_REMINDER_STAGES = [
  { stage: "t14", daysBefore: 14 },
  { stage: "t3", daysBefore: 3 },
  { stage: "due", daysBefore: 0 },
] as const;

export type RenewalReminderStage =
  (typeof RENEWAL_REMINDER_STAGES)[number]["stage"];

/**
 * How many consecutive days an overdue service keeps nudging.
 *
 * After this the row stays marked overdue on the page and simply stops
 * notifying. A reminder nobody has acted on for a fortnight will not be acted
 * on because it was sent a fifteenth time, and the page never stops saying so.
 */
export const OVERDUE_NOTICE_MAX_DAYS = 14;

/** The renewal states derived from a renewal date, never stored. */
export type RenewalState =
  | "scheduled"
  | "due_soon"
  | "imminent"
  | "due"
  | "overdue";

/**
 * Whole calendar days from `fromKey` to `toKey`, negative when `toKey` is in
 * the past. Both are "YYYY-MM-DD" keys, so this is exact date arithmetic with
 * no timezone or daylight saving to get wrong.
 */
export function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** The renewal state of `renewalDate` as of `todayKey`, both date keys. */
export function renewalStateFor(
  renewalDate: string,
  todayKey: string
): RenewalState {
  const days = daysBetweenDateKeys(todayKey, renewalDate);
  if (days < 0) return "overdue";
  if (days === 0) return "due";
  if (days <= 3) return "imminent";
  if (days <= 14) return "due_soon";
  return "scheduled";
}

// ── Activity reporting ────────────────────────────────────────────────────

/**
 * How recent a stored activity timestamp has to be for a fresh report to be
 * skipped, in milliseconds.
 *
 * 55 minutes rather than a round hour so a client reporting "about hourly" is
 * not dropped by a few seconds of clock drift and quietly made half as
 * frequent. Shared because mobile, the portal and the server all have to agree
 * on one number: the clients use it to avoid a pointless round trip, and the
 * server uses it as the real cap, since a misbehaving client must not be able
 * to drive write volume.
 */
export const ACTIVITY_REPORT_THROTTLE_MS = 55 * 60 * 1000;

// ── Text caps ─────────────────────────────────────────────────────────────

export const COST_NAME_MAX = 80;
export const COST_PLAN_MAX = 60;
export const COST_PURPOSE_MAX = 160;
export const COST_HELD_BY_MAX = 80;
export const COST_NOTES_MAX = 500;

// ── Formatting and validation helpers ─────────────────────────────────────

/**
 * True only for an absolute `https://` URL.
 *
 * Enforced on write rather than on render, because both pages put a stored
 * console URL straight into an anchor and a `javascript:` value there would
 * execute in a System Admin's browser. One rule, used by the form and by the
 * mutation, so the form can never accept what the mutation will reject.
 */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Bytes rendered the way an object storage console states them: binary
 * prefixes, one decimal place, e.g. 1572864 → "1.5 MiB".
 *
 * Binary rather than decimal so the figure on this page matches the figure in
 * the Cloudflare dashboard it can be checked against. Whole bytes below 1 KiB.
 */
export function formatBytesBinary(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0
    ? `${Math.round(value)} ${units[0]}`
    : `${value.toFixed(1)} ${units[unit]}`;
}

// ── Honest gaps ───────────────────────────────────────────────────────────

/**
 * Every number `spec/SRS.md` §4.3.3 asks for whose source does not exist yet.
 *
 * These render as sentences on the analytics page, never as a zero and never
 * as a tile with a dash: a System Admin acting on a fabricated zero is worse
 * off than one told plainly that the counter is not built. Each entry names
 * the feature that will supply it, so the later feature has an obvious slot
 * and this list shortens as they land.
 */
export const ANALYTICS_GAPS = [
  {
    key: "profileSendBacks",
    section: "engagement",
    label: "Profiles sent back",
    sentence:
      "Not counted yet. Send-backs start being recorded when the profile lifecycle work (feature 9) lands.",
  },
  {
    key: "claimsWaiting",
    section: "engagement",
    label: "Department claims waiting",
    sentence:
      "Not counted yet. Claims appear once the shared department shell (feature 17) is built.",
  },
  {
    key: "radioListeningHours",
    section: "engagement",
    label: "Radio listening hours",
    sentence:
      "Not counted yet. Listening records begin with the Radio core (feature 20).",
  },
  {
    key: "smsSent",
    section: "notifications",
    label: "SMS sent and credit left",
    sentence:
      "Not counted yet. SMS figures arrive with Hospitality SMS (feature 27).",
  },
  {
    key: "storeDownloads",
    section: "devices",
    label: "Store downloads",
    sentence:
      "Not shown. Phase 01 counts phones signed in rather than store downloads, which the stores do not report automatically.",
  },
] as const;

export type AnalyticsGap = (typeof ANALYTICS_GAPS)[number];
export type AnalyticsGapKey = AnalyticsGap["key"];
export type AnalyticsGapSection = AnalyticsGap["section"];

/** The gap lines belonging to one section of the analytics page. */
export function analyticsGapsFor(
  section: AnalyticsGapSection
): readonly AnalyticsGap[] {
  return ANALYTICS_GAPS.filter((gap) => gap.section === section);
}
