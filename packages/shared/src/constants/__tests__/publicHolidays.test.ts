import { describe, it, expect } from "vitest";
import {
  EID_HOLIDAYS,
  easterSunday,
  publicHolidayMap,
  publicHolidaysForYear,
} from "../publicHolidays";

describe("easterSunday", () => {
  it("matches known Easter dates", () => {
    expect(easterSunday(2024)).toEqual([3, 31]);
    expect(easterSunday(2025)).toEqual([4, 20]);
    expect(easterSunday(2026)).toEqual([4, 5]);
    expect(easterSunday(2027)).toEqual([3, 28]);
  });
});

describe("publicHolidaysForYear", () => {
  it("includes the fixed holidays and the Easter pair, in date order", () => {
    const days = publicHolidaysForYear(2026);
    const dates = days.map((h) => h.date);
    expect(dates).toContain("2026-06-03"); // Martyrs' Day
    expect(dates).toContain("2026-10-09"); // Independence Day
    expect(days.find((h) => h.name === "Good Friday")?.date).toBe("2026-04-03");
    expect(days.find((h) => h.name === "Easter Monday")?.date).toBe("2026-04-06");
    expect([...dates].sort()).toEqual(dates);
  });

  it("rolls an Easter Monday over a month end", () => {
    // Easter 2024 was 31 March, so Easter Monday is 1 April.
    const days = publicHolidaysForYear(2024);
    expect(days.find((h) => h.name === "Easter Monday")?.date).toBe("2024-04-01");
  });

  it("adds Eid only for its own year", () => {
    const eid2026 = EID_HOLIDAYS.filter((h) => h.date.startsWith("2026-"));
    const names = publicHolidaysForYear(2026).map((h) => h.date);
    for (const h of eid2026) expect(names).toContain(h.date);
    expect(publicHolidaysForYear(2030).some((h) => h.name.startsWith("Eid"))).toBe(false);
  });

  it("keeps every hand kept Eid row a valid date", () => {
    for (const h of EID_HOLIDAYS) {
      expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(h.date))).toBe(false);
    }
  });
});

describe("publicHolidayMap", () => {
  it("looks holidays up by date across years", () => {
    const map = publicHolidayMap([2026, 2027]);
    expect(map.get("2026-12-25")).toBe("Christmas Day");
    expect(map.get("2027-01-01")).toBe("New Year's Day");
    expect(map.get("2026-07-15")).toBeUndefined();
  });
});
