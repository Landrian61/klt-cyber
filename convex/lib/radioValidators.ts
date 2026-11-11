import { v } from "convex/values";
import {
  RADIO_BROADCAST_ORIGINS,
  RADIO_BROADCAST_STATUSES,
  RADIO_DETECTED_STATES,
  RADIO_INBOX_TYPES,
  RADIO_OVERRIDE_STATES,
  RADIO_PROGRAM_RECURRENCES,
  type RadioBroadcastOrigin,
  type RadioBroadcastStatus,
  type RadioDetectedState,
  type RadioInboxType,
  type RadioOverrideState,
  type RadioProgramRecurrence,
} from "@klt-cyber/shared";

// Radio core's unions (spec 0019), derived from the shared tuples rather than
// retyped, for the same reason convex/lib/libraryValidators.ts derives its own:
// a value added in one place and not the other is a row the schema rejects at
// runtime instead of a mismatch the typechecker catches.

/** `weekly | occasional`. */
export const vRadioProgramRecurrence = v.union(
  ...RADIO_PROGRAM_RECURRENCES.map((r) => v.literal<RadioProgramRecurrence>(r))
);

/** `scheduled | oneOff | auto`. */
export const vRadioBroadcastOrigin = v.union(
  ...RADIO_BROADCAST_ORIGINS.map((o) => v.literal<RadioBroadcastOrigin>(o))
);

/** `scheduled | cancelled`. On air and finished are read from the clock. */
export const vRadioBroadcastStatus = v.union(
  ...RADIO_BROADCAST_STATUSES.map((s) => v.literal<RadioBroadcastStatus>(s))
);

/** `live | off_air | unknown`, what a probe found. */
export const vRadioDetectedState = v.union(
  ...RADIO_DETECTED_STATES.map((s) => v.literal<RadioDetectedState>(s))
);

/** `live | off_air`. Interrupted can never be forced (AC-6). */
export const vRadioOverrideState = v.union(
  ...RADIO_OVERRIDE_STATES.map((s) => v.literal<RadioOverrideState>(s))
);

/** `prayer_request | testimony`. */
export const vRadioInboxType = v.union(
  ...RADIO_INBOX_TYPES.map((t) => v.literal<RadioInboxType>(t))
);
