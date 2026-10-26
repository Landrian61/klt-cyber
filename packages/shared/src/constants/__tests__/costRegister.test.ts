import { describe, expect, it } from "vitest";
import {
  ACTIVITY_REPORT_THROTTLE_MS,
  BILLING_CYCLE_LABELS,
  FX_RATE_STALE_AFTER_MS,
  convertUgxToUsdMinor,
  convertUsdMinorToUgx,
  isFxRateStale,
  roundUgxForDisplay,
  ANALYTICS_GAPS,
  BILLING_CYCLES,
  COST_CURRENCIES,
  COST_SERVICE_KEYS,
  CYCLES_REQUIRING_RENEWAL_DATE,
  OVERDUE_NOTICE_MAX_DAYS,
  RENEWAL_REMINDER_STAGES,
  SERVICE_USAGE_METRIC,
  advanceRenewalDate,
  analyticsGapsFor,
  costAmountToMajor,
  costAmountToMinor,
  cycleRequiresRenewalDate,
  daysBetweenDateKeys,
  formatBytesBinary,
  formatCostAmount,
  isCostCurrency,
  isHttpsUrl,
  monthlyContributionMinor,
  renewalStateFor,
} from "../costRegister";

describe("the service key set", () => {
  it("has one key per SRS §7 service, with the two stores split", () => {
    expect(COST_SERVICE_KEYS).toHaveLength(14);
    expect(COST_SERVICE_KEYS).toContain("app_store");
    expect(COST_SERVICE_KEYS).toContain("play_console");
  });

  it("holds no duplicates", () => {
    expect(new Set(COST_SERVICE_KEYS).size).toBe(COST_SERVICE_KEYS.length);
  });

  // The guard that stops a usage metric being hung off a service key that
  // does not exist, which would silently never render.
  it("is the only source of keys SERVICE_USAGE_METRIC may use", () => {
    for (const key of Object.keys(SERVICE_USAGE_METRIC)) {
      expect(COST_SERVICE_KEYS).toContain(key);
    }
  });
});

describe("the currency table", () => {
  it("gives the dollar two decimals and the shilling none", () => {
    expect(COST_CURRENCIES.USD.exponent).toBe(2);
    expect(COST_CURRENCIES.UGX.exponent).toBe(0);
  });

  it("recognises only the two codes the register accepts", () => {
    expect(isCostCurrency("USD")).toBe(true);
    expect(isCostCurrency("UGX")).toBe(true);
    expect(isCostCurrency("EUR")).toBe(false);
    expect(isCostCurrency("")).toBe(false);
  });
});

describe("formatCostAmount", () => {
  it("renders dollars from cents", () => {
    expect(formatCostAmount(2499, "USD")).toBe("$24.99");
    expect(formatCostAmount(9900, "USD")).toBe("$99.00");
    expect(formatCostAmount(0, "USD")).toBe("$0.00");
  });

  it("renders shillings whole, with grouping", () => {
    expect(formatCostAmount(50000, "UGX")).toBe("USh 50,000");
    expect(formatCostAmount(0, "UGX")).toBe("USh 0");
  });

  it("groups thousands of dollars", () => {
    expect(formatCostAmount(123456789, "USD")).toBe("$1,234,567.89");
  });

  it("round-trips through the minor/major converters", () => {
    expect(costAmountToMinor(24.99, "USD")).toBe(2499);
    expect(costAmountToMinor(50000, "UGX")).toBe(50000);
    expect(costAmountToMajor(2499, "USD")).toBe(24.99);
    expect(costAmountToMajor(50000, "UGX")).toBe(50000);
  });

  it("rounds a typed amount to whole minor units", () => {
    // Float arithmetic on money is exactly what minor units exist to avoid;
    // the converter must land on a whole number whatever was typed.
    expect(costAmountToMinor(0.1 + 0.2, "USD")).toBe(30);
    expect(Number.isInteger(costAmountToMinor(19.995, "USD"))).toBe(true);
  });
});

describe("monthlyContributionMinor", () => {
  it("passes a monthly cost through in full", () => {
    expect(monthlyContributionMinor(2499, "monthly")).toBe(2499);
  });

  it("gives an annual cost one twelfth, rounded", () => {
    expect(monthlyContributionMinor(9900, "annual")).toBe(825);
    // 1000 / 12 = 83.33…, which must round rather than truncate.
    expect(monthlyContributionMinor(1000, "annual")).toBe(83);
    expect(monthlyContributionMinor(100, "annual")).toBe(8);
  });

  it("gives nothing for the three cycles that do not renew", () => {
    expect(monthlyContributionMinor(5000, "prepaid_credit")).toBe(0);
    expect(monthlyContributionMinor(5000, "free_tier")).toBe(0);
    expect(monthlyContributionMinor(5000, "pay_as_you_go")).toBe(0);
  });

  it("gives nothing when either argument is absent", () => {
    expect(monthlyContributionMinor(undefined, "monthly")).toBe(0);
    expect(monthlyContributionMinor(2499, undefined)).toBe(0);
    expect(monthlyContributionMinor(undefined, undefined)).toBe(0);
  });

  it("makes the per-row figures add up to the total (AC-13)", () => {
    const rows: [number, "monthly" | "annual"][] = [
      [2499, "monthly"],
      [9900, "annual"],
    ];
    const perRow = rows.map(([amount, cycle]) =>
      monthlyContributionMinor(amount, cycle)
    );
    expect(perRow.reduce((a, b) => a + b, 0)).toBe(3324);
  });
});

describe("the cycles requiring a renewal date", () => {
  it("is exactly monthly and annual", () => {
    expect([...CYCLES_REQUIRING_RENEWAL_DATE].sort()).toEqual([
      "annual",
      "monthly",
    ]);
    for (const cycle of BILLING_CYCLES) {
      expect(cycleRequiresRenewalDate(cycle)).toBe(
        cycle === "monthly" || cycle === "annual"
      );
    }
  });
});

describe("advanceRenewalDate", () => {
  it("moves a monthly date on one month", () => {
    expect(advanceRenewalDate("2026-03-15", "monthly")).toBe("2026-04-15");
  });

  it("crosses a year boundary from December", () => {
    expect(advanceRenewalDate("2026-12-10", "monthly")).toBe("2027-01-10");
  });

  it("moves an annual date on one year", () => {
    expect(advanceRenewalDate("2026-07-01", "annual")).toBe("2027-07-01");
  });

  it("clamps a 31st onto a shorter month", () => {
    expect(advanceRenewalDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceRenewalDate("2026-03-31", "monthly")).toBe("2026-04-30");
  });

  it("clamps onto a leap February", () => {
    expect(advanceRenewalDate("2028-01-31", "monthly")).toBe("2028-02-29");
  });

  it("moves 29 February onto a non-leap year", () => {
    expect(advanceRenewalDate("2028-02-29", "annual")).toBe("2029-02-28");
  });

  it("leaves a non-renewing cycle's date alone", () => {
    expect(advanceRenewalDate("2026-03-15", "free_tier")).toBe("2026-03-15");
    expect(advanceRenewalDate("2026-03-15", "prepaid_credit")).toBe(
      "2026-03-15"
    );
    expect(advanceRenewalDate("2026-03-15", "pay_as_you_go")).toBe(
      "2026-03-15"
    );
  });
});

describe("daysBetweenDateKeys and renewalStateFor", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetweenDateKeys("2026-03-01", "2026-03-15")).toBe(14);
    expect(daysBetweenDateKeys("2026-03-15", "2026-03-01")).toBe(-14);
    expect(daysBetweenDateKeys("2026-03-01", "2026-03-01")).toBe(0);
  });

  it("counts across a month and a year boundary", () => {
    expect(daysBetweenDateKeys("2026-02-25", "2026-03-04")).toBe(7);
    expect(daysBetweenDateKeys("2026-12-28", "2027-01-04")).toBe(7);
  });

  it("reads each threshold as a band, not an exact day", () => {
    const today = "2026-03-01";
    expect(renewalStateFor("2026-04-01", today)).toBe("scheduled");
    expect(renewalStateFor("2026-03-16", today)).toBe("scheduled");
    expect(renewalStateFor("2026-03-15", today)).toBe("due_soon");
    expect(renewalStateFor("2026-03-05", today)).toBe("due_soon");
    expect(renewalStateFor("2026-03-04", today)).toBe("imminent");
    expect(renewalStateFor("2026-03-02", today)).toBe("imminent");
    expect(renewalStateFor("2026-03-01", today)).toBe("due");
    expect(renewalStateFor("2026-02-28", today)).toBe("overdue");
  });
});

describe("the reminder stage table", () => {
  it("is 14, 3 and 0 days, in that order", () => {
    expect(RENEWAL_REMINDER_STAGES.map((s) => s.daysBefore)).toEqual([
      14, 3, 0,
    ]);
    expect(RENEWAL_REMINDER_STAGES.map((s) => s.stage)).toEqual([
      "t14",
      "t3",
      "due",
    ]);
  });

  it("caps the overdue nudge at a fortnight", () => {
    expect(OVERDUE_NOTICE_MAX_DAYS).toBe(14);
  });
});

describe("ACTIVITY_REPORT_THROTTLE_MS", () => {
  it("is 55 minutes, short of the hour it protects", () => {
    expect(ACTIVITY_REPORT_THROTTLE_MS).toBe(55 * 60 * 1000);
    expect(ACTIVITY_REPORT_THROTTLE_MS).toBeLessThan(60 * 60 * 1000);
  });
});

describe("isHttpsUrl", () => {
  it("accepts an absolute https URL", () => {
    expect(isHttpsUrl("https://dash.cloudflare.com")).toBe(true);
    expect(isHttpsUrl("https://play.google.com/console/u/0/developers")).toBe(
      true
    );
  });

  it("rejects everything that is not https", () => {
    expect(isHttpsUrl("http://example.com")).toBe(false);
    // The reason the rule exists: both pages render this value as an anchor.
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("data:text/html,hi")).toBe(false);
    expect(isHttpsUrl("dash.cloudflare.com")).toBe(false);
    expect(isHttpsUrl("")).toBe(false);
    expect(isHttpsUrl("   ")).toBe(false);
  });
});

describe("formatBytesBinary", () => {
  it("shows whole bytes below a kibibyte", () => {
    expect(formatBytesBinary(0)).toBe("0 B");
    expect(formatBytesBinary(512)).toBe("512 B");
    expect(formatBytesBinary(1023)).toBe("1023 B");
  });

  it("uses binary prefixes to one decimal place", () => {
    expect(formatBytesBinary(1024)).toBe("1.0 KiB");
    expect(formatBytesBinary(1_572_864)).toBe("1.5 MiB");
    expect(formatBytesBinary(1024 ** 3)).toBe("1.0 GiB");
    expect(formatBytesBinary(1024 ** 4)).toBe("1.0 TiB");
  });

  it("stops at the largest prefix it knows", () => {
    expect(formatBytesBinary(1024 ** 6)).toBe("1024.0 PiB");
  });

  it("never renders a negative or non-finite figure", () => {
    expect(formatBytesBinary(-1)).toBe("0 B");
    expect(formatBytesBinary(Number.NaN)).toBe("0 B");
  });
});

describe("the analytics gap list", () => {
  it("names all five uncounted SRS §4.3.3 numbers", () => {
    expect(ANALYTICS_GAPS.map((gap) => gap.key).sort()).toEqual([
      "claimsWaiting",
      "profileSendBacks",
      "radioListeningHours",
      "smsSent",
      "storeDownloads",
    ]);
  });

  it("gives every gap a sentence, never a number", () => {
    for (const gap of ANALYTICS_GAPS) {
      expect(gap.sentence.length).toBeGreaterThan(0);
      expect(gap.label.length).toBeGreaterThan(0);
    }
  });

  it("splits the gaps across the sections that render them", () => {
    expect(analyticsGapsFor("engagement")).toHaveLength(3);
    expect(analyticsGapsFor("notifications")).toHaveLength(1);
    expect(analyticsGapsFor("devices")).toHaveLength(1);
  });
});

describe("one time costs", () => {
  it("is a cycle that does not renew and needs no date", () => {
    expect(BILLING_CYCLES).toContain("one_time");
    expect(cycleRequiresRenewalDate("one_time")).toBe(false);
    expect(CYCLES_REQUIRING_RENEWAL_DATE).not.toContain("one_time");
  });

  it("contributes nothing to a monthly total", () => {
    // The Play Console's $25 is paid once. Amortising it over some invented
    // number of months would put a figure on the page that no month matches.
    expect(monthlyContributionMinor(2500, "one_time")).toBe(0);
  });

  it("gives every cycle a label, so a card can never render undefined", () => {
    for (const cycle of BILLING_CYCLES) {
      expect(BILLING_CYCLE_LABELS[cycle]).toBeTruthy();
    }
  });
});

describe("currency conversion", () => {
  const RATE = 4336.261444; // a real figure from the source, not a round one

  it("turns dollar cents into whole shillings", () => {
    expect(convertUsdMinorToUgx(9900, RATE)).toBe(429290);
    expect(convertUsdMinorToUgx(2500, RATE)).toBe(108407);
  });

  it("converts back the other way", () => {
    expect(convertUgxToUsdMinor(433626, RATE)).toBe(10000);
  });

  it("round trips within a cent", () => {
    const ugx = convertUsdMinorToUgx(2499, RATE);
    expect(Math.abs(convertUgxToUsdMinor(ugx, RATE) - 2499)).toBeLessThanOrEqual(1);
  });

  it("converts zero to zero rather than to a rounding artefact", () => {
    expect(convertUsdMinorToUgx(0, RATE)).toBe(0);
    expect(convertUgxToUsdMinor(0, RATE)).toBe(0);
  });

  it("blunts a converted figure to a precision the rate can support", () => {
    // A rate that moves tens of shillings a day cannot justify a figure quoted
    // to the shilling, so the display rounds and the "≈" says so.
    expect(roundUgxForDisplay(429290)).toBe(429300);
    expect(roundUgxForDisplay(108407)).toBe(108400);
    expect(roundUgxForDisplay(4336)).toBe(4340);
    expect(roundUgxForDisplay(850)).toBe(850);
  });

  it("rounds to the nearest step rather than down", () => {
    // Rounding down everywhere would make a total sit below the parts that
    // produced it, which is the one thing a money page must not do.
    expect(roundUgxForDisplay(10_050)).toBe(10_100);
    expect(roundUgxForDisplay(10_049)).toBe(10_000);
  });
});

describe("exchange rate freshness", () => {
  const now = Date.UTC(2026, 9, 26, 12, 0, 0);

  it("treats a rate fetched today as current", () => {
    expect(isFxRateStale(now - 60_000, now)).toBe(false);
  });

  it("tolerates a single missed daily fetch", () => {
    expect(isFxRateStale(now - 2 * 24 * 60 * 60 * 1000, now)).toBe(false);
  });

  it("calls a rate stale once it has stopped refreshing", () => {
    expect(isFxRateStale(now - FX_RATE_STALE_AFTER_MS - 1, now)).toBe(true);
  });
});
