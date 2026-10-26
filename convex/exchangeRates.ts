import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { reportError } from "./lib/sentry";
import type { UsdToUgxRate } from "@klt-cyber/shared";

/**
 * The dollar rate the cost register reads (spec 0011).
 *
 * Every service the platform pays for bills in dollars except the prepaid SMS
 * credit, but the church's money is shillings, so a dollar figure on its own
 * is not an answer anybody at a budget meeting can use. This fetches one
 * number a day and the register renders both.
 *
 * The rate is never written into a service row. It converts at render time,
 * next to the moment it was read, so a figure on the page can always be
 * checked against the rate that produced it. A stored conversion would be
 * indistinguishable from an invoice amount a week later, which is exactly the
 * confusion the register exists to prevent.
 */

const BASE = "USD";
const QUOTE = "UGX";

/**
 * Keyless, free, and daily. `open.er-api.com` is ExchangeRate-API's open
 * endpoint: no account, no token to rotate, no secret to leak out of a
 * deployment variable, which for one public reference number is worth more
 * than the extra precision a paid feed would buy.
 */
const RATE_URL = `https://open.er-api.com/v6/latest/${BASE}`;
const SOURCE = "open.er-api.com";

/** As much of the response as this code relies on. */
interface RateResponse {
  result?: string;
  rates?: Record<string, number>;
}

/**
 * Fetch the dollar rate and record it. Runs daily, shortly after the source's
 * own refresh.
 *
 * A failure is reported and swallowed. The previous rate stays with its
 * original timestamp, and the page goes on showing it and saying how old it
 * is: a shilling figure from yesterday's rate is useful, and one computed
 * from a rate nobody can date is not.
 */
export const fetchUsdToUgx = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const response = await fetch(RATE_URL);
      if (!response.ok) {
        throw new Error(`${SOURCE} answered ${response.status}`);
      }

      const body = (await response.json()) as RateResponse;
      const rate = body.rates?.[QUOTE];

      // Checked rather than trusted: an endpoint that starts answering with an
      // error envelope, or drops the shilling, must not be allowed to write a
      // zero or a NaN into a figure the church budgets against.
      if (body.result !== "success") {
        throw new Error(`${SOURCE} returned result=${String(body.result)}`);
      }
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
        throw new Error(`${SOURCE} gave no usable ${QUOTE} rate`);
      }

      await ctx.runMutation(internal.exchangeRates.saveRate, { rate });
    } catch (error) {
      await reportError(ctx, error, { fn: "exchangeRates.fetchUsdToUgx" });
    }

    return null;
  },
});

/** Write the fetched rate into the single USD/UGX row. */
export const saveRate = internalMutation({
  args: { rate: v.number() },
  handler: async (ctx, { rate }) => {
    const fetchedAt = Date.now();
    const existing = await ctx.db
      .query("exchangeRates")
      .withIndex("by_pair", (q) => q.eq("base", BASE).eq("quote", QUOTE))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { rate, fetchedAt, source: SOURCE });
    } else {
      await ctx.db.insert("exchangeRates", {
        base: BASE,
        quote: QUOTE,
        rate,
        fetchedAt,
        source: SOURCE,
      });
    }

    return null;
  },
});

/**
 * The current USD to UGX rate, or null before the job has ever run.
 *
 * Null is a real answer and callers must render it as one: the register shows
 * dollar figures alone and says the rate is not available yet, rather than
 * quietly falling back to a hardcoded number that would be wrong within a week
 * and impossible to spot.
 */
export async function usdToUgxRate(
  ctx: QueryCtx
): Promise<UsdToUgxRate | null> {
  const row = await ctx.db
    .query("exchangeRates")
    .withIndex("by_pair", (q) => q.eq("base", BASE).eq("quote", QUOTE))
    .first();
  if (!row) return null;
  return { rate: row.rate, fetchedAt: row.fetchedAt, source: row.source };
}
