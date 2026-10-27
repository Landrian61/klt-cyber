/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountDeletion from "../accountDeletion.js";
import type * as activity from "../activity.js";
import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as announcements from "../announcements.js";
import type * as auth from "../auth.js";
import type * as calendar from "../calendar.js";
import type * as children from "../children.js";
import type * as churchAdminSeed from "../churchAdminSeed.js";
import type * as clans from "../clans.js";
import type * as content from "../content.js";
import type * as contentSeed from "../contentSeed.js";
import type * as costs from "../costs.js";
import type * as crons from "../crons.js";
import type * as departmentActivities from "../departmentActivities.js";
import type * as departmentMemberships from "../departmentMemberships.js";
import type * as departmentMigration from "../departmentMigration.js";
import type * as departmentShell from "../departmentShell.js";
import type * as departments from "../departments.js";
import type * as devotionals from "../devotionals.js";
import type * as emails from "../emails.js";
import type * as events from "../events.js";
import type * as exchangeRates from "../exchangeRates.js";
import type * as facilities from "../facilities.js";
import type * as groups from "../groups.js";
import type * as hodNotices from "../hodNotices.js";
import type * as http from "../http.js";
import type * as leadershipMigration from "../leadershipMigration.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_costValidators from "../lib/costValidators.js";
import type * as lib_departmentMembership from "../lib/departmentMembership.js";
import type * as lib_emails_layout from "../lib/emails/layout.js";
import type * as lib_emails_templates from "../lib/emails/templates.js";
import type * as lib_environment from "../lib/environment.js";
import type * as lib_groupMembership from "../lib/groupMembership.js";
import type * as lib_media from "../lib/media.js";
import type * as lib_occurrences from "../lib/occurrences.js";
import type * as lib_recurrence from "../lib/recurrence.js";
import type * as lib_reminders from "../lib/reminders.js";
import type * as lib_sentry from "../lib/sentry.js";
import type * as memberProfiles from "../memberProfiles.js";
import type * as notifications from "../notifications.js";
import type * as pastEvents from "../pastEvents.js";
import type * as plannedActivities from "../plannedActivities.js";
import type * as profile from "../profile.js";
import type * as roles from "../roles.js";
import type * as seed from "../seed.js";
import type * as themes from "../themes.js";
import type * as upcoming from "../upcoming.js";
import type * as uploads from "../uploads.js";
import type * as userStatusMigration from "../userStatusMigration.js";
import type * as users from "../users.js";
import type * as weeklyPrograms from "../weeklyPrograms.js";
import type * as weeklyProgramsMigration from "../weeklyProgramsMigration.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountDeletion: typeof accountDeletion;
  activity: typeof activity;
  admin: typeof admin;
  analytics: typeof analytics;
  announcements: typeof announcements;
  auth: typeof auth;
  calendar: typeof calendar;
  children: typeof children;
  churchAdminSeed: typeof churchAdminSeed;
  clans: typeof clans;
  content: typeof content;
  contentSeed: typeof contentSeed;
  costs: typeof costs;
  crons: typeof crons;
  departmentActivities: typeof departmentActivities;
  departmentMemberships: typeof departmentMemberships;
  departmentMigration: typeof departmentMigration;
  departmentShell: typeof departmentShell;
  departments: typeof departments;
  devotionals: typeof devotionals;
  emails: typeof emails;
  events: typeof events;
  exchangeRates: typeof exchangeRates;
  facilities: typeof facilities;
  groups: typeof groups;
  hodNotices: typeof hodNotices;
  http: typeof http;
  leadershipMigration: typeof leadershipMigration;
  "lib/authz": typeof lib_authz;
  "lib/costValidators": typeof lib_costValidators;
  "lib/departmentMembership": typeof lib_departmentMembership;
  "lib/emails/layout": typeof lib_emails_layout;
  "lib/emails/templates": typeof lib_emails_templates;
  "lib/environment": typeof lib_environment;
  "lib/groupMembership": typeof lib_groupMembership;
  "lib/media": typeof lib_media;
  "lib/occurrences": typeof lib_occurrences;
  "lib/recurrence": typeof lib_recurrence;
  "lib/reminders": typeof lib_reminders;
  "lib/sentry": typeof lib_sentry;
  memberProfiles: typeof memberProfiles;
  notifications: typeof notifications;
  pastEvents: typeof pastEvents;
  plannedActivities: typeof plannedActivities;
  profile: typeof profile;
  roles: typeof roles;
  seed: typeof seed;
  themes: typeof themes;
  upcoming: typeof upcoming;
  uploads: typeof uploads;
  userStatusMigration: typeof userStatusMigration;
  users: typeof users;
  weeklyPrograms: typeof weeklyPrograms;
  weeklyProgramsMigration: typeof weeklyProgramsMigration;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  pushNotifications: import("@convex-dev/expo-push-notifications/_generated/component.js").ComponentApi<"pushNotifications">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
