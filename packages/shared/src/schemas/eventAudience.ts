import { z } from "zod";

/**
 * Church event audiences (spec 0021, AC-11).
 *
 * An event is for the whole church, for everyone serving in any department, or
 * for a chosen set of departments. The Convex validator in
 * convex/lib/eventAudience.ts mirrors this shape; the existence and paused
 * checks on `departmentIds` stay on the server, since this package cannot read
 * the database.
 */
export const EVENT_AUDIENCE_TYPES = ["church", "serving", "departments"] as const;

export type EventAudienceType = (typeof EVENT_AUDIENCE_TYPES)[number];

export const EVENT_AUDIENCE_LABELS: Record<EventAudienceType, string> = {
  church: "Whole church",
  serving: "Everyone serving",
  departments: "Selected departments",
};

export const eventAudienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("church") }),
  z.object({ type: z.literal("serving") }),
  z.object({
    type: z.literal("departments"),
    departmentIds: z
      .array(z.string().min(1))
      .min(1, "Choose at least one department")
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "A department is listed twice",
      }),
  }),
]);

export type EventAudienceInput = z.infer<typeof eventAudienceSchema>;

/**
 * True when two audiences address the same people by definition: the same
 * type and, for `departments`, the same set of ids in any order. One rule for
 * the server (which replaces reminders and sends N16 only on a change) and the
 * portal (which warns before an audience change), so the two cannot disagree.
 */
export function sameEventAudience(
  a: { type: EventAudienceType; departmentIds?: readonly string[] },
  b: { type: EventAudienceType; departmentIds?: readonly string[] },
): boolean {
  if (a.type !== b.type) return false;
  if (a.type !== "departments") return true;
  const left = new Set(a.departmentIds ?? []);
  const right = new Set(b.departmentIds ?? []);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** The longest an event cancellation reason may be, after trimming. */
export const EVENT_CANCELLATION_REASON_MAX_LENGTH = 200;

/**
 * Error codes for church events. The server throws plain `Error`s whose
 * message starts with the code and a colon, so a client matches on the prefix.
 */
export const EVENT_ERROR = {
  INVALID_EVENT_AUDIENCE: "INVALID_EVENT_AUDIENCE",
  EVENT_ALREADY_CANCELLED: "EVENT_ALREADY_CANCELLED",
  EVENT_ALREADY_ENDED: "EVENT_ALREADY_ENDED",
  EVENT_ARCHIVED: "EVENT_ARCHIVED",
  EVENT_CANCELLED_LOCKED: "EVENT_CANCELLED_LOCKED",
  NOT_FOUND: "NOT_FOUND",
} as const;

export type EventErrorCode = (typeof EVENT_ERROR)[keyof typeof EVENT_ERROR];

/** True when an error thrown by a Convex call carries this code as its prefix. */
export function hasErrorCode(error: unknown, code: string): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(`${code}:`);
}
