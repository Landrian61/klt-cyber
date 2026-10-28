import { v } from "convex/values";
import { NOTIFICATION_KINDS, type NotificationKind } from "@klt-cyber/shared";

// The SRS §5 catalogue code a notification row carries (spec 0013), derived
// from the shared list rather than retyped as a literal union here, for the
// same reason convex/lib/costValidators.ts derives its sets: a code added in
// one place and not the other is a row the schema rejects.
export const vNotificationKind = v.union(
  ...NOTIFICATION_KINDS.map((kind) => v.literal<NotificationKind>(kind))
);
