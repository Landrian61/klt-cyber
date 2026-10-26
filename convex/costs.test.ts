import { describe, expect, it } from "vitest";
import { pickStage } from "./costs";

/**
 * Which renewal reminder fires, and when (spec 0011, AC-14, AC-15).
 *
 * These exist because the first version of `pickStage` walked
 * `RENEWAL_REMINDER_STAGES` in declaration order, which is farthest first, and
 * so answered "t14" for a service three days from renewing. The notice would
 * have read "Renewal in 14 days" above a date three days away. Every case
 * below is about picking the *nearest* applicable stage and never a farther
 * one.
 */

const TODAY = "2026-10-26";
const none: { stage: "t14" | "t3" | "due"; noticeDate: string }[] = [];
const sent = (stage: "t14" | "t3" | "due", noticeDate = "2026-10-20") => [
  { stage, noticeDate },
];

describe("pickStage", () => {
  it("says nothing while a renewal is further off than the first stage", () => {
    expect(pickStage(20, none, TODAY)).toBeNull();
    expect(pickStage(15, none, TODAY)).toBeNull();
  });

  it("fires t14 at and inside fourteen days", () => {
    expect(pickStage(14, none, TODAY)).toBe("t14");
    expect(pickStage(10, none, TODAY)).toBe("t14");
  });

  it("fires t3 at three days, not a late t14", () => {
    // The regression. A service recorded three days before it renews gets one
    // "in 3 days" notice, never that plus an "in 14 days" the date contradicts.
    expect(pickStage(3, none, TODAY)).toBe("t3");
    expect(pickStage(1, none, TODAY)).toBe("t3");
  });

  it("never reaches back to a stage whose moment has passed", () => {
    // t3 has gone out and the renewal is now one day away. Nothing is due;
    // falling back to the unsent t14 would send a notice about a fortnight
    // that ended eleven days ago.
    expect(pickStage(1, sent("t3"), TODAY)).toBeNull();
  });

  it("goes quiet once the applicable stage has been sent, then speaks again", () => {
    expect(pickStage(10, sent("t14"), TODAY)).toBeNull();
    expect(pickStage(3, sent("t14"), TODAY)).toBe("t3");
  });

  it("fires each of t14 and t3 only once per renewal date", () => {
    expect(pickStage(14, sent("t14"), TODAY)).toBeNull();
    expect(pickStage(3, [...sent("t14"), ...sent("t3")], TODAY)).toBeNull();
  });

  it("catches up on a missed sweep rather than losing the notice", () => {
    // The sweep did not run on the day the service was exactly 14 days out.
    // Thresholds, not equalities, so it still fires the next day.
    expect(pickStage(13, none, TODAY)).toBe("t14");
  });

  it("fires due on the day, and again each day it stays overdue", () => {
    expect(pickStage(0, none, TODAY)).toBe("due");
    expect(pickStage(-5, none, TODAY)).toBe("due");
    // Once today, never twice today.
    expect(pickStage(-5, sent("due", TODAY), TODAY)).toBeNull();
    // Yesterday's notice does not stop today's.
    expect(pickStage(-6, sent("due", "2026-10-25"), TODAY)).toBe("due");
  });

  it("sends due for a renewal recorded already overdue, not t14 then t3", () => {
    // A service entered five days late used to send "in 14 days", then
    // "in 3 days", and only then the truth.
    expect(pickStage(-5, none, TODAY)).toBe("due");
  });
});
