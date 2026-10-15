import type { Id } from "@/lib/api";
import type { MaritalStatus, Sex } from "@klt-cyber/shared";

export type DemographicProfile = {
  sex: Sex;
  maritalStatus: MaritalStatus;
  dateOfBirth?: { day: number; month: number; year?: number };
  clanId?: Id<"clans">;
};

// The full row shape from `memberProfiles.listProfilesForAnalytics` — every
// filterable/chartable field, pending AND verified profiles alike. Superset
// of DemographicProfile so the age/marital/clan bucketers above accept it
// unchanged.
export type AnalyticsProfile = DemographicProfile & {
  profileStatus: "pending_verification" | "verified";
  _creationTime: number;
  verifiedAt?: number;
  mentorshipStatus: "not_enrolled" | "enrolled" | "completed";
  leadershipStage:
    | "not_enrolled"
    | "level_1"
    | "level_2"
    | "advanced"
    | "completed";
  departmentIds: Id<"departments">[];
};

export const AGE_BUCKETS = [
  { label: "Youth", min: 0, max: 17 },
  { label: "Young adult", min: 18, max: 30 },
  { label: "Adult", min: 31, max: 55 },
  { label: "Elder", min: 56, max: Infinity },
];

/** Which AGE_BUCKETS label a date of birth falls into — null if unknown/unshared. */
export function ageBucketLabel(
  dob: DemographicProfile["dateOfBirth"],
): string | null {
  const age = ageFromDob(dob);
  if (age === null) return null;
  return AGE_BUCKETS.find((b) => age >= b.min && age <= b.max)?.label ?? null;
}

function ageFromDob(dob: DemographicProfile["dateOfBirth"]): number | null {
  if (!dob?.year) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.year;
  const hasHadBirthdayThisYear =
    now.getMonth() + 1 > dob.month ||
    (now.getMonth() + 1 === dob.month && now.getDate() >= dob.day);
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export function bucketAgeGroups(profiles: DemographicProfile[]) {
  const counts = AGE_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  let unknown = 0;
  for (const p of profiles) {
    const age = ageFromDob(p.dateOfBirth);
    if (age === null) {
      unknown += 1;
      continue;
    }
    const bucketIndex = AGE_BUCKETS.findIndex(
      (b) => age >= b.min && age <= b.max,
    );
    if (bucketIndex !== -1) counts[bucketIndex].count += 1;
  }
  if (unknown > 0) counts.push({ label: "Not shared", count: unknown });
  return counts;
}

export function bucketClans(
  profiles: DemographicProfile[],
  clanNameById: Map<Id<"clans">, string>,
) {
  const counts = new Map<string, number>();
  let noClan = 0;
  for (const p of profiles) {
    if (!p.clanId) {
      noClan += 1;
      continue;
    }
    const name = clanNameById.get(p.clanId) ?? "Unknown";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  if (noClan > 0) sorted.push({ label: "No clan set", count: noClan });
  return sorted;
}

export function bucketAgeBySex(profiles: DemographicProfile[]) {
  const buckets = AGE_BUCKETS.map((b) => ({
    label: b.label,
    male: 0,
    female: 0,
  }));
  for (const p of profiles) {
    const age = ageFromDob(p.dateOfBirth);
    if (age === null) continue;
    const bucketIndex = AGE_BUCKETS.findIndex(
      (b) => age >= b.min && age <= b.max,
    );
    if (bucketIndex === -1) continue;
    if (p.sex === "male") buckets[bucketIndex].male += 1;
    else buckets[bucketIndex].female += 1;
  }
  return buckets;
}

export function bucketMaritalBySex(profiles: DemographicProfile[]) {
  const labels: Record<string, string> = {
    single: "Single",
    married: "Married",
    widowed: "Widowed",
    divorced: "Divorced",
  };
  const order = ["single", "married", "widowed", "divorced"];
  const buckets = order.map((key) => ({
    label: labels[key],
    male: 0,
    female: 0,
  }));
  for (const p of profiles) {
    const idx = order.indexOf(p.maritalStatus);
    if (idx === -1) continue;
    if (p.sex === "male") buckets[idx].male += 1;
    else buckets[idx].female += 1;
  }
  return buckets.filter((b) => b.male > 0 || b.female > 0);
}

type MentorshipProfile = { mentorshipStatus: AnalyticsProfile["mentorshipStatus"] };

export function bucketMentorship(profiles: MentorshipProfile[]) {
  const counts = { not_enrolled: 0, enrolled: 0, completed: 0 };
  for (const p of profiles) counts[p.mentorshipStatus] += 1;
  return [
    { label: "Not enrolled", count: counts.not_enrolled },
    { label: "Enrolled", count: counts.enrolled },
    { label: "Completed", count: counts.completed },
  ];
}

/** Completed / total, as a whole-number percentage — null with no profiles. */
export function mentorshipCompletionRate(profiles: MentorshipProfile[]) {
  if (profiles.length === 0) return null;
  const completed = profiles.filter(
    (p) => p.mentorshipStatus === "completed",
  ).length;
  return Math.round((completed / profiles.length) * 100);
}

type LeadershipProfile = { leadershipStage: AnalyticsProfile["leadershipStage"] };

const LEADERSHIP_STAGE_ORDER: {
  key: AnalyticsProfile["leadershipStage"];
  label: string;
}[] = [
  { key: "not_enrolled", label: "Not enrolled" },
  { key: "level_1", label: "Level 1" },
  { key: "level_2", label: "Level 2" },
  { key: "advanced", label: "Advanced" },
  { key: "completed", label: "Completed" },
];

export function bucketLeadershipStage(profiles: LeadershipProfile[]) {
  const counts = new Map<AnalyticsProfile["leadershipStage"], number>();
  for (const p of profiles) {
    counts.set(p.leadershipStage, (counts.get(p.leadershipStage) ?? 0) + 1);
  }
  return LEADERSHIP_STAGE_ORDER.map(({ key, label }) => ({
    label,
    count: counts.get(key) ?? 0,
  }));
}

/** Completed the whole pipeline / total, as a whole-number percentage. */
export function leadershipCompletionRate(profiles: LeadershipProfile[]) {
  if (profiles.length === 0) return null;
  const completed = profiles.filter(
    (p) => p.leadershipStage === "completed",
  ).length;
  return Math.round((completed / profiles.length) * 100);
}

type DepartmentMemberProfile = { departmentIds: Id<"departments">[] };

/**
 * Active roster size per department, derived from the (Zone 1-filtered)
 * profile array — powers the dashboard's Department Roster Sizes chart, so
 * it reacts to the same filters as every other Zone 3 chart. Not
 * zero-filled: departments with zero matches simply don't appear, which is
 * the right trade-off for a filtered view (an unfiltered, always-zero-filled
 * ranking would need a separate, unfiltered data source instead).
 */
export function bucketDepartments(
  profiles: DepartmentMemberProfile[],
  departmentNameById: Map<Id<"departments">, string>,
) {
  const counts = new Map<string, number>();
  for (const p of profiles) {
    for (const departmentId of p.departmentIds) {
      const name = departmentNameById.get(departmentId) ?? "Unknown";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

type ClanMaritalProfile = {
  clanId?: Id<"clans">;
  maritalStatus: DemographicProfile["maritalStatus"];
};

/** Same clan-naming/sort/no-clan-set convention as `bucketClans`, split by
 * marital status (single/married/other) per clan — for the Clan × Marital
 * Status chart. */
export function bucketClanByMaritalStatus(
  profiles: ClanMaritalProfile[],
  clanNameById: Map<Id<"clans">, string>,
) {
  const buckets = new Map<
    string,
    { clan: string; single: number; married: number; other: number }
  >();
  let noClan: { clan: string; single: number; married: number; other: number } | null =
    null;

  for (const p of profiles) {
    const name = p.clanId ? clanNameById.get(p.clanId) ?? "Unknown" : null;
    const target = name
      ? (buckets.get(name) ??
        (() => {
          const row = { clan: name, single: 0, married: 0, other: 0 };
          buckets.set(name, row);
          return row;
        })())
      : (noClan ??= { clan: "No clan set", single: 0, married: 0, other: 0 });

    if (p.maritalStatus === "single") target.single += 1;
    else if (p.maritalStatus === "married") target.married += 1;
    else target.other += 1;
  }

  const sorted = Array.from(buckets.values()).sort(
    (a, b) => b.single + b.married + b.other - (a.single + a.married + a.other),
  );
  if (noClan) sorted.push(noClan);
  return sorted;
}

export type AgeByDepartmentRow = { department: string; counts: number[]; total: number };

type AgeDepartmentProfile = DemographicProfile & DepartmentMemberProfile;

/**
 * Age bracket (AGE_BUCKETS, as columns) × department (as rows) matrix for
 * the Ministry Engagement heatmap. Zero-filled across ALL departments passed
 * in (not just ones appearing in `profiles`), so a department with no
 * matches still renders a visible all-zero row. Profiles with no shareable
 * date of birth are excluded — a cell needs a resolvable age bucket.
 */
export function bucketAgeByDepartment(
  profiles: AgeDepartmentProfile[],
  departments: { _id: Id<"departments">; name: string }[],
): AgeByDepartmentRow[] {
  const rows = new Map<Id<"departments">, AgeByDepartmentRow>();
  for (const d of departments) {
    rows.set(d._id, {
      department: d.name,
      counts: AGE_BUCKETS.map(() => 0),
      total: 0,
    });
  }

  for (const p of profiles) {
    const label = ageBucketLabel(p.dateOfBirth);
    if (label === null) continue;
    const bucketIndex = AGE_BUCKETS.findIndex((b) => b.label === label);
    if (bucketIndex === -1) continue;
    for (const departmentId of p.departmentIds) {
      const row = rows.get(departmentId);
      if (!row) continue;
      row.counts[bucketIndex] += 1;
      row.total += 1;
    }
  }

  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

// ── Shared dashboard filter state (Zone 1) ──────────────────────────────────
// One predicate, used identically to filter the chart/KPI population
// (`listProfilesForAnalytics`) and the roster-table population
// (`listProfileRoster`) — so the two can never silently disagree.

const FILTER_ALL = "all";
/** Ministry-filter sentinel for "not in any department" — distinct from a
 * real `Id<"departments">`, which Convex IDs never collide with. */
export const NO_DEPARTMENT_FILTER = "none";

export type DashboardFilters = {
  sex: string;
  maritalStatus: string;
  ageBracket: string;
  clanId: string;
  departmentId: string;
  leadershipStage: string;
  verificationStatus: string;
  mentorshipStatus: string;
  dateFrom?: number;
  dateTo?: number;
};

export const DASHBOARD_FILTERS_DEFAULT: DashboardFilters = {
  sex: FILTER_ALL,
  maritalStatus: FILTER_ALL,
  ageBracket: FILTER_ALL,
  clanId: FILTER_ALL,
  departmentId: FILTER_ALL,
  leadershipStage: FILTER_ALL,
  verificationStatus: FILTER_ALL,
  mentorshipStatus: FILTER_ALL,
  dateFrom: undefined,
  dateTo: undefined,
};

const DAY_MS = 24 * 60 * 60 * 1000;

type FilterableProfile = AnalyticsProfile;

/** Whether a profile matches every active Zone 1 filter. Date range scopes
 * submission date ("joined in this window") — the dashboard's chart
 * population is filtered by member attributes, not a trend's x-axis. */
export function matchesDashboardFilters(
  p: FilterableProfile,
  f: DashboardFilters,
): boolean {
  if (f.sex !== FILTER_ALL && p.sex !== f.sex) return false;
  if (f.maritalStatus !== FILTER_ALL && p.maritalStatus !== f.maritalStatus)
    return false;
  if (f.ageBracket !== FILTER_ALL && ageBucketLabel(p.dateOfBirth) !== f.ageBracket)
    return false;
  if (f.clanId !== FILTER_ALL && p.clanId !== f.clanId) return false;
  if (f.departmentId === NO_DEPARTMENT_FILTER) {
    if (p.departmentIds.length > 0) return false;
  } else if (
    f.departmentId !== FILTER_ALL &&
    !p.departmentIds.includes(f.departmentId as Id<"departments">)
  ) {
    return false;
  }
  if (f.verificationStatus !== FILTER_ALL && p.profileStatus !== f.verificationStatus)
    return false;
  if (f.mentorshipStatus !== FILTER_ALL && p.mentorshipStatus !== f.mentorshipStatus)
    return false;
  if (f.leadershipStage !== FILTER_ALL && p.leadershipStage !== f.leadershipStage)
    return false;
  if (f.dateFrom !== undefined && p._creationTime < f.dateFrom) return false;
  if (f.dateTo !== undefined && p._creationTime >= f.dateTo + DAY_MS) return false;
  return true;
}

/** How many of the 9 filters are set away from "all"/unset — drives the
 * active-count badge on the filter bar. */
export function activeDashboardFilterCount(f: DashboardFilters): number {
  const selects = [
    f.sex,
    f.maritalStatus,
    f.ageBracket,
    f.clanId,
    f.departmentId,
    f.leadershipStage,
    f.verificationStatus,
    f.mentorshipStatus,
  ].filter((v) => v !== FILTER_ALL).length;
  return selects + (f.dateFrom ? 1 : 0) + (f.dateTo ? 1 : 0);
}

