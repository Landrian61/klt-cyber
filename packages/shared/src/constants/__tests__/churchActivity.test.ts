import { describe, it, expect } from "vitest";
import { CHURCH_ACTIVITY_ACTIONS } from "../churchActivity";

// Spec 0021, AC-1: the dashboard allowlist. Whether every action is actually
// written somewhere in convex/ is checked by the Convex suite (task 12).

describe("CHURCH_ACTIVITY_ACTIONS", () => {
  it("has no duplicates", () => {
    expect(new Set(CHURCH_ACTIVITY_ACTIONS).size).toBe(
      CHURCH_ACTIVITY_ACTIONS.length,
    );
  });

  it("uses the area.verb shape for every action", () => {
    for (const action of CHURCH_ACTIVITY_ACTIONS) {
      expect(action).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });

  it("includes the two actions spec 0021 introduces", () => {
    expect(CHURCH_ACTIVITY_ACTIONS).toContain("content.event_cancelled");
    expect(CHURCH_ACTIVITY_ACTIONS).toContain("content.activity_deleted");
  });
});
