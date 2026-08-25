/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as announcements from "../announcements.js";
import type * as auth from "../auth.js";
import type * as calendar from "../calendar.js";
import type * as children from "../children.js";
import type * as churchAdminSeed from "../churchAdminSeed.js";
import type * as clans from "../clans.js";
import type * as content from "../content.js";
import type * as contentSeed from "../contentSeed.js";
import type * as departmentMemberships from "../departmentMemberships.js";
import type * as departmentMigration from "../departmentMigration.js";
import type * as departments from "../departments.js";
import type * as events from "../events.js";
import type * as facilities from "../facilities.js";
import type * as http from "../http.js";
import type * as leadershipMigration from "../leadershipMigration.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_media from "../lib/media.js";
import type * as memberProfiles from "../memberProfiles.js";
import type * as plannedActivities from "../plannedActivities.js";
import type * as profile from "../profile.js";
import type * as roles from "../roles.js";
import type * as seed from "../seed.js";
import type * as themes from "../themes.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";
import type * as weeklyPrograms from "../weeklyPrograms.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  announcements: typeof announcements;
  auth: typeof auth;
  calendar: typeof calendar;
  children: typeof children;
  churchAdminSeed: typeof churchAdminSeed;
  clans: typeof clans;
  content: typeof content;
  contentSeed: typeof contentSeed;
  departmentMemberships: typeof departmentMemberships;
  departmentMigration: typeof departmentMigration;
  departments: typeof departments;
  events: typeof events;
  facilities: typeof facilities;
  http: typeof http;
  leadershipMigration: typeof leadershipMigration;
  "lib/authz": typeof lib_authz;
  "lib/media": typeof lib_media;
  memberProfiles: typeof memberProfiles;
  plannedActivities: typeof plannedActivities;
  profile: typeof profile;
  roles: typeof roles;
  seed: typeof seed;
  themes: typeof themes;
  uploads: typeof uploads;
  users: typeof users;
  weeklyPrograms: typeof weeklyPrograms;
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
};
