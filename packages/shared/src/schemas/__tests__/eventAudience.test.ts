import { describe, it, expect } from "vitest";
import {
  EVENT_AUDIENCE_LABELS,
  EVENT_AUDIENCE_TYPES,
  EVENT_CANCELLATION_REASON_MAX_LENGTH,
  EVENT_ERROR,
  eventAudienceSchema,
  hasErrorCode,
  sameEventAudience,
} from "../eventAudience";

// Spec 0021, AC-11: the three audience shapes, and the list rules the shared
// layer can check without the database.

describe("eventAudienceSchema", () => {
  it("accepts the whole church", () => {
    expect(eventAudienceSchema.safeParse({ type: "church" }).success).toBe(true);
  });

  it("accepts everyone serving", () => {
    expect(eventAudienceSchema.safeParse({ type: "serving" }).success).toBe(true);
  });

  it("accepts a list of departments", () => {
    const result = eventAudienceSchema.safeParse({
      type: "departments",
      departmentIds: ["dep_media", "dep_choir"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty department list", () => {
    const result = eventAudienceSchema.safeParse({
      type: "departments",
      departmentIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a duplicate department", () => {
    const result = eventAudienceSchema.safeParse({
      type: "departments",
      departmentIds: ["dep_media", "dep_media"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects the departments type without a list", () => {
    expect(
      eventAudienceSchema.safeParse({ type: "departments" }).success,
    ).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(eventAudienceSchema.safeParse({ type: "visitors" }).success).toBe(
      false,
    );
  });
});

describe("event audience constants", () => {
  it("labels every audience type", () => {
    for (const type of EVENT_AUDIENCE_TYPES) {
      expect(EVENT_AUDIENCE_LABELS[type].length).toBeGreaterThan(0);
    }
    expect(Object.keys(EVENT_AUDIENCE_LABELS)).toHaveLength(
      EVENT_AUDIENCE_TYPES.length,
    );
  });

  it("caps a cancellation reason at 200 characters", () => {
    expect(EVENT_CANCELLATION_REASON_MAX_LENGTH).toBe(200);
  });

  it("uses each error code as its own value", () => {
    for (const [key, value] of Object.entries(EVENT_ERROR)) {
      expect(value).toBe(key);
    }
  });
});

describe("sameEventAudience", () => {
  it("compares type, and department lists as sets", () => {
    expect(sameEventAudience({ type: "church" }, { type: "church" })).toBe(true);
    expect(sameEventAudience({ type: "church" }, { type: "serving" })).toBe(false);
    expect(
      sameEventAudience(
        { type: "departments", departmentIds: ["a", "b"] },
        { type: "departments", departmentIds: ["b", "a"] },
      ),
    ).toBe(true);
    expect(
      sameEventAudience(
        { type: "departments", departmentIds: ["a"] },
        { type: "departments", departmentIds: ["a", "b"] },
      ),
    ).toBe(false);
  });
});

describe("hasErrorCode", () => {
  it("matches a code prefix inside a Convex error message", () => {
    const error = new Error(
      "[CONVEX M(events:cancelEvent)] Uncaught Error: EVENT_ALREADY_ENDED: This event has already ended.",
    );
    expect(hasErrorCode(error, EVENT_ERROR.EVENT_ALREADY_ENDED)).toBe(true);
    expect(hasErrorCode(error, EVENT_ERROR.EVENT_ARCHIVED)).toBe(false);
  });
});
