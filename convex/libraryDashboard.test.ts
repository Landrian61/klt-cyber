import { describe, expect, it } from "vitest";
import {
  LIBRARY_LOW_STOCK_THRESHOLD,
  LIBRARY_MOVEMENT_SCAN_CAP,
  LIBRARY_TREND_MONTHS,
  kampalaMonthKey,
  kampalaMonthWindow,
} from "@klt-cyber/shared";
import {
  bucketMonthlyCounts,
  bucketMovements,
  newestVisible,
  shareOf,
  summariseFormatMix,
  summariseHealth,
  summariseStock,
  takeNewestWithinCap,
} from "./library";

/**
 * The Library dashboard's counting rules (spec 0017, AC-29).
 *
 * Each is tested against the exact function the query calls, not against a
 * restatement of it. The four dashboard queries resolve the caller through the
 * Better Auth component, which this harness cannot stand up (see
 * `convex/library.test.ts`'s header), so they cannot be driven end to end. The
 * rules were therefore written as pure exported functions the handlers call,
 * rather than as expressions inlined in handlers no test can reach.
 *
 * The Kampala month boundary itself is tested where the helper lives, in
 * `packages/shared/src/constants/__tests__/weeklyPrograms.test.ts`. What is
 * tested here is that the bucketing USES it, and that a timestamp either side
 * of a Kampala midnight lands in the month it should.
 *
 * What is NOT covered here, deliberately: that each handler gates on
 * `manageLibrary` before reading anything, that the Stock handler reads
 * `libraryStockMovements` exactly once, and that an unopened tab holds no
 * subscription. The first is reachable through the authority matrix in
 * `library.test.ts`; the other two are review and behaviour, and belong to
 * `/check verify` driving the real app.
 */

// 17 Nov 2026, 09:00 UTC — mid month and mid day in Kampala, so no test below
// accidentally depends on being near a boundary unless it says it does.
const NOW = Date.UTC(2026, 10, 17, 9, 0);

/** A physical row, with only the fields the stock rules look at. */
function physical(quantityOnHand?: number, priceUgx?: number) {
  return { quantityOnHand, priceUgx };
}

describe("summariseStock: the shelf value price rule (AC-14)", () => {
  // The point of this test: an unset price and a price OF zero are different
  // things, and the whole reason the code checks for `undefined` rather than
  // for falsiness. If someone "simplifies" that to `if (!item.priceUgx)`, the
  // free item at zero shillings starts being reported as unpriced and the
  // hint on the card starts lying about why the total is short.
  it("treats an unset price as zero and a zero price as a real price", () => {
    const summary = summariseStock([
      physical(4, 20_000), // 80,000
      physical(3, 0), // priced, at zero: contributes nothing, counts as priced
      physical(2, undefined), // unpriced, holds stock: named in the hint
    ]);
    expect(summary.shelfValueUgx).toBe(80_000);
    expect(summary.unpricedWithStock).toBe(1);
  });

  it("does not name an unpriced item that holds no stock", () => {
    // It would contribute nothing to the total either way, so naming it in the
    // hint would be noise rather than an explanation.
    const summary = summariseStock([physical(0, undefined), physical(5, 1_000)]);
    expect(summary.shelfValueUgx).toBe(5_000);
    expect(summary.unpricedWithStock).toBe(0);
  });

  it("returns real zeros rather than nothing when there is no stock", () => {
    // Not an empty state: zero units on hand is a true and useful answer, and
    // the four figures must stay numeric (AC-27).
    const summary = summariseStock([]);
    expect(summary).toEqual({
      unitsOnHand: 0,
      shelfValueUgx: 0,
      unpricedWithStock: 0,
      runningLow: 0,
      outOfStock: 0,
      lowStockCombined: 0,
    });
  });

  it("sums units across every physical row, priced or not", () => {
    const summary = summariseStock([
      physical(10, 5_000),
      physical(0),
      physical(7),
    ]);
    expect(summary.unitsOnHand).toBe(17);
  });
});

describe("summariseStock: low and out of stock are disjoint (AC-13)", () => {
  // The point of this test: the Stock tab splits the population at zero while
  // Overview's single card combines it. If the two were computed separately
  // they could drift, and an item at zero could be counted twice. The code
  // defines the combined figure AS the sum of the two disjoint ones, and this
  // is what holds that.
  it("counts an item at zero as out of stock and not as running low", () => {
    const summary = summariseStock([
      physical(0, 1_000),
      physical(0, 1_000),
      physical(1, 1_000),
      physical(LIBRARY_LOW_STOCK_THRESHOLD, 1_000),
      physical(LIBRARY_LOW_STOCK_THRESHOLD + 1, 1_000),
    ]);
    expect(summary.outOfStock).toBe(2);
    expect(summary.runningLow).toBe(2);
    // Overview's combined card, which includes the zeros, counting each item
    // exactly once.
    expect(summary.lowStockCombined).toBe(4);
    expect(summary.lowStockCombined).toBe(
      summary.runningLow + summary.outOfStock,
    );
  });

  it("puts an item exactly at the threshold in running low, not above it", () => {
    const summary = summariseStock([physical(LIBRARY_LOW_STOCK_THRESHOLD, 100)]);
    expect(summary.runningLow).toBe(1);
    expect(summary.outOfStock).toBe(0);
  });

  it("treats an unset quantity as zero, so it is out of stock", () => {
    const summary = summariseStock([physical(undefined, 100)]);
    expect(summary.outOfStock).toBe(1);
    expect(summary.runningLow).toBe(0);
  });

  it("never double counts: the two figures always partition the low set", () => {
    const rows = [0, 0, 1, 5, 10, 11, 400].map((q) => physical(q, 100));
    const summary = summariseStock(rows);
    const lowByHand = rows.filter(
      (row) => (row.quantityOnHand ?? 0) <= LIBRARY_LOW_STOCK_THRESHOLD,
    ).length;
    expect(summary.lowStockCombined).toBe(lowByHand);
  });
});

describe("summariseHealth and shareOf: the null share (AC-11, AC-12)", () => {
  // The point of this test: an empty catalogue has no denominator, and a
  // confident `0%` or `100%` computed from nothing is worse than no number at
  // all. Null is what lets the panel render its empty state instead.
  it("returns null for every share when the catalogue is empty", () => {
    for (const metric of summariseHealth([])) {
      expect(metric.share).toBeNull();
      expect(metric.present).toBe(0);
      expect(metric.missing).toBe(0);
    }
    expect(shareOf(0, 0)).toBeNull();
    expect(shareOf(5, 0)).toBeNull();
  });

  it("counts a field present only when it is non empty after trimming", () => {
    const [cover, author, description] = summariseHealth([
      { coverImageUrl: "covers/abc.jpg", author: "Apostle", description: "A" },
      // Whitespace is not a description, and a present-but-blank field is the
      // exact case an afternoon of catalogue tidying is meant to find.
      { coverImageUrl: "   ", author: "", description: "   " },
      { coverImageUrl: undefined, author: undefined, description: undefined },
    ]);
    expect(cover.present).toBe(1);
    expect(cover.missing).toBe(2);
    expect(author.present).toBe(1);
    expect(description.present).toBe(1);
    expect(cover.share).toBe(33);
  });

  it("counts a seeded absolute URL as a cover", () => {
    // The member sees a cover either way, so the health figure should agree
    // with what the member sees rather than with where the bytes live.
    const [cover] = summariseHealth([
      { coverImageUrl: "https://images.example.com/seeded.jpg" },
    ]);
    expect(cover.present).toBe(1);
    expect(cover.share).toBe(100);
  });

  it("rounds each share independently rather than to a total of a hundred", () => {
    expect(shareOf(1, 3)).toBe(33);
    // Three equal thirds honestly read 33, 33, 33 (AC-8).
    expect(shareOf(1, 3)! * 3).toBe(99);
  });
});

describe("the hidden item rule (AC-26, AC-7)", () => {
  function item(
    id: string,
    hidden: boolean,
    format: "physical" | "pdf" | "audio",
    createdAt: number,
  ) {
    return { _id: id, hidden, format, createdAt };
  }

  // The point of this test: hidden means hidden from MEMBERS, never hidden
  // from the team's own counts. Something withdrawn from the app is still on
  // the shelf and still cost money. The only places a hidden row drops out are
  // the two lists SRS 4.13.3 names.
  const rows = [
    item("a", false, "pdf", 300),
    item("b", true, "pdf", 200),
    item("c", false, "physical", 100),
    item("d", true, "physical", 400),
  ];

  it("counts hidden items in the format mix and in catalogue health", () => {
    const mix = summariseFormatMix(rows);
    expect(mix.find((slice) => slice.format === "pdf")!.count).toBe(2);
    expect(mix.find((slice) => slice.format === "physical")!.count).toBe(2);
    // Every format in the union appears, even one nothing is filed under, so
    // the chart does not quietly change shape (AC-8).
    expect(mix.map((slice) => slice.format)).toEqual([
      "physical",
      "pdf",
      "audio",
    ]);
    expect(mix.find((slice) => slice.format === "audio")!.count).toBe(0);

    expect(summariseHealth(rows)[0].missing).toBe(4);
  });

  it("excludes hidden items from the member facing lists", () => {
    expect(newestVisible(rows, 10).map((row) => row._id)).toEqual(["a", "c"]);
  });

  it("excludes hidden items from the free content list too", () => {
    // The longer Free content list is the same rule as Overview's highlights,
    // just more of it (AC-20).
    expect(newestVisible(rows, 10, true).map((row) => row._id)).toEqual(["a"]);
  });

  it("orders those lists newest first and respects the size cap", () => {
    const many = [
      item("old", false, "pdf", 100),
      item("mid", false, "pdf", 200),
      item("new", false, "pdf", 300),
    ];
    expect(newestVisible(many, 2).map((row) => row._id)).toEqual([
      "new",
      "mid",
    ]);
  });
});

describe("bucketMonthlyCounts and bucketMovements (AC-10, AC-15, AC-25)", () => {
  const { keys } = kampalaMonthWindow(NOW, LIBRARY_TREND_MONTHS);

  it("always returns exactly the window's length, zero filled", () => {
    const series = bucketMonthlyCounts(keys, []);
    expect(series).toHaveLength(LIBRARY_TREND_MONTHS);
    expect(series.every((point) => point.count === 0)).toBe(true);
    // A quiet month is a zero point, never a missing one.
    expect(series.map((point) => point.month)).toEqual(keys);
  });

  it("buckets by the Kampala month, not by the UTC one", () => {
    // 31 Oct 2026 at 23:30 Kampala is 20:30 UTC the same day; 21:00 UTC is
    // already 1 Nov in Kampala. These two instants are half an hour apart and
    // belong to different months.
    const lateOctober = Date.UTC(2026, 9, 31, 20, 30);
    const earlyNovember = Date.UTC(2026, 9, 31, 21, 30);
    const series = bucketMonthlyCounts(keys, [lateOctober, earlyNovember]);
    const byMonth = new Map(series.map((p) => [p.month, p.count]));
    expect(byMonth.get("2026-10")).toBe(1);
    expect(byMonth.get("2026-11")).toBe(1);
  });

  it("drops a timestamp outside the window rather than folding it in", () => {
    // Two years ago is not "the oldest month"; counting it there would make
    // the first bar silently wrong.
    const series = bucketMonthlyCounts(keys, [Date.UTC(2024, 5, 1)]);
    expect(series.reduce((sum, point) => sum + point.count, 0)).toBe(0);
  });

  it("splits movements by direction and sums quantities, not rows", () => {
    const series = bucketMovements(keys, [
      { createdAt: NOW, direction: "in", quantity: 12 },
      { createdAt: NOW, direction: "in", quantity: 3 },
      { createdAt: NOW, direction: "out", quantity: 4 },
    ]);
    const current = series.find((point) => point.month === "2026-11")!;
    expect(current.in).toBe(15);
    expect(current.out).toBe(4);
  });

  it("counts a movement in its own month whatever happened to its item", () => {
    // A removed item's history still happened and the stock still moved, which
    // is why nothing in the bucketing looks at the item at all (AC-15).
    const series = bucketMovements(keys, [
      { createdAt: Date.UTC(2026, 7, 4), direction: "out", quantity: 9 },
    ]);
    expect(series.find((point) => point.month === "2026-08")!.out).toBe(9);
  });
});

describe("takeNewestWithinCap: truncation costs the oldest (AC-22, AC-23)", () => {
  /** A descending run of movements, newest first, one a day back from `NOW`. */
  function descending(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      createdAt: NOW - index * 86_400_000,
      index,
    }));
  }

  // The point of this test: an ascending read truncated at the cap would drop
  // the NEWEST movements, silently emptying the current month and the ninety
  // day movers while the page claimed only to be partial. The direction of the
  // read is the whole safeguard, and this is what holds it.
  it("keeps the newest rows and drops the oldest when over the cap", () => {
    const scanned = descending(LIBRARY_MOVEMENT_SCAN_CAP + 1);
    const result = takeNewestWithinCap(scanned, LIBRARY_MOVEMENT_SCAN_CAP);
    expect(result.partial).toBe(true);
    expect(result.movements).toHaveLength(LIBRARY_MOVEMENT_SCAN_CAP);
    // The newest row survives, which is the property that matters.
    expect(result.movements[0].index).toBe(0);
    expect(result.movements[0].createdAt).toBe(NOW);
    // The one that was dropped is the oldest.
    expect(
      result.movements.some(
        (movement) => movement.index === LIBRARY_MOVEMENT_SCAN_CAP,
      ),
    ).toBe(false);
  });

  it("detects the cap exactly, from the extra row rather than from a length", () => {
    // A read that happens to return exactly the cap is NOT partial. Inferring
    // it from the length would make the page apologise for nothing, every time
    // the history happened to be that long.
    const exact = takeNewestWithinCap(
      descending(LIBRARY_MOVEMENT_SCAN_CAP),
      LIBRARY_MOVEMENT_SCAN_CAP,
    );
    expect(exact.partial).toBe(false);
    expect(exact.coverageFrom).toBeNull();
    expect(exact.movements).toHaveLength(LIBRARY_MOVEMENT_SCAN_CAP);
  });

  it("names the month coverage begins at, not merely that it is partial", () => {
    // The reader has to know WHICH bar to distrust, because that first covered
    // month's own totals are themselves incomplete.
    const scanned = descending(5);
    const result = takeNewestWithinCap(scanned, 3);
    expect(result.partial).toBe(true);
    expect(result.movements.map((m) => m.index)).toEqual([0, 1, 2]);
    expect(result.coverageFrom).toBe(kampalaMonthKey(scanned[2].createdAt));
  });

  it("says nothing about coverage when the read was complete", () => {
    const result = takeNewestWithinCap(descending(2), 10);
    expect(result.partial).toBe(false);
    expect(result.coverageFrom).toBeNull();
  });

  it("handles an empty read without claiming partial coverage", () => {
    const result = takeNewestWithinCap([], LIBRARY_MOVEMENT_SCAN_CAP);
    expect(result.partial).toBe(false);
    expect(result.coverageFrom).toBeNull();
    expect(result.movements).toEqual([]);
  });
});
