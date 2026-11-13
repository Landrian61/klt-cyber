import { v } from "convex/values";
import {
  AGE_BRACKETS,
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  FOLLOW_UP_OUTCOMES,
  FOLLOW_UP_STATUSES,
  LOGGED_CONTACT_CHANNELS,
  SEX,
  VISITOR_KINDS,
  VISITOR_LIST_STATUSES,
  VISIT_COUNT_BUCKETS,
  type AgeBracket,
  type ContactChannel,
  type ContactOutcome,
  type FollowUpOutcome,
  type FollowUpStatus,
  type Sex,
  type VisitorKind,
  type VisitorListStatus,
  type VisitCountBucket,
} from "@klt-cyber/shared";

// Hospitality's unions (spec 0024), derived from the shared lists rather than
// retyped, the same reason `libraryValidators.ts` derives its own: a value
// added in one place and not the other becomes a row the schema rejects at
// runtime instead of a mismatch the typechecker catches.
//
// Kept apart from `lib/hospitality.ts` because `schema.ts` imports this file,
// and that one imports `authz.ts`, which imports the auth component.

export const vVisitorKind = v.union(
  ...VISITOR_KINDS.map((kind) => v.literal<VisitorKind>(kind))
);

export const vVisitorListStatus = v.union(
  ...VISITOR_LIST_STATUSES.map((status) => v.literal<VisitorListStatus>(status))
);

export const vFollowUpStatus = v.union(
  ...FOLLOW_UP_STATUSES.map((status) => v.literal<FollowUpStatus>(status))
);

export const vFollowUpOutcome = v.union(
  ...FOLLOW_UP_OUTCOMES.map((outcome) => v.literal<FollowUpOutcome>(outcome))
);

export const vContactChannel = v.union(
  ...CONTACT_CHANNELS.map((channel) => v.literal<ContactChannel>(channel))
);

/** The channels an operator logs by hand; `in_app` is written only by N41. */
export const vLoggedContactChannel = v.union(
  ...LOGGED_CONTACT_CHANNELS.map((channel) => v.literal<ContactChannel>(channel))
);

export const vContactOutcome = v.union(
  ...CONTACT_OUTCOMES.map((outcome) => v.literal<ContactOutcome>(outcome))
);

/** The visit count filter's buckets (AC-11). */
export const vVisitCountBucket = v.union(
  ...VISIT_COUNT_BUCKETS.map((bucket) => v.literal<VisitCountBucket>(bucket))
);

export const vSex = v.union(...SEX.map((sex) => v.literal<Sex>(sex)));

export const vAgeBracket = v.union(
  ...AGE_BRACKETS.map((bracket) => v.literal<AgeBracket>(bracket))
);

/**
 * A walk in's consent to keep their phone (AC-6, AC-22 to AC-24). Live while
 * `withdrawnAt` is absent; `visitors.phone` exists only while it is live.
 */
export const vVisitorConsent = v.object({
  givenAt: v.number(),
  givenBy: v.id("users"),
  note: v.optional(v.string()),
  withdrawnAt: v.optional(v.number()),
  withdrawnBy: v.optional(v.id("users")),
});
