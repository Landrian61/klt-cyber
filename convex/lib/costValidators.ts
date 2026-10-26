import { v } from "convex/values";
import type { VLiteral, VUnion } from "convex/values";
import {
  BILLING_CYCLES,
  COST_CURRENCY_CODES,
  COST_SERVICE_KEYS,
  type BillingCycle,
  type CostCurrency,
  type CostServiceKey,
} from "@klt-cyber/shared";

// Convex validators for the three closed sets the cost register stores
// (spec 0011), derived from the shared constants rather than retyped beside
// them. `convex/AGENTS.md`: import enums from @klt-cyber/shared, never
// redefine them here. Writing these as hand-copied literal unions in
// schema.ts would mean adding a service key in two places, and the day
// somebody adds it in one is the day the seed writes a row the schema
// rejects.

/** A closed union validator over a readonly tuple of string literals. */
function literalUnion<T extends string>(
  values: readonly T[]
): VUnion<T, VLiteral<T>[], "required"> {
  return v.union(...values.map((value) => v.literal(value)));
}

export const vCostServiceKey = literalUnion<CostServiceKey>(COST_SERVICE_KEYS);
export const vCostCurrency = literalUnion<CostCurrency>(COST_CURRENCY_CODES);
export const vBillingCycle = literalUnion<BillingCycle>(BILLING_CYCLES);
