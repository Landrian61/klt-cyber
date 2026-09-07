import type { Id } from "@/lib/api";
import { AGE_BUCKETS, ageBucketLabel, type AnalyticsProfile } from "./demographicsUtils";

// A generic cross-tab engine: one description per filterable attribute
// ("dimension"), plus a single `crossTab` function that combines any two of
// them into a matrix. Replaces the pattern of writing a new hand-rolled
// bucketX / bucketXByY function for every combination someone asks for —
// see CrossTabExplorer.tsx, which lets Church Admin pick any two dimensions
// on demand instead of waiting for a new chart to be built.

export type DimensionContext = {
  clanNameById: Map<Id<"clans">, string>;
  departmentNameById: Map<Id<"departments">, string>;
};

export type Dimension = {
  key: string;
  label: string;
  /** Ordered bucket labels this dimension can take — drives axis/legend
   * order and zero-fill (every value appears even with a zero count). */
  values(ctx: DimensionContext): string[];
  /** Which bucket(s) a profile falls into. Almost always one value; empty
   * only if this dimension genuinely cannot classify the profile (never the
   * case here — unknowns get an explicit "Not set"/"Not shared" bucket
   * instead, so totals stay honest). More than one value only for
   * `department`, since a member can serve in up to 3. */
  bucketsFor(profile: AnalyticsProfile, ctx: DimensionContext): string[];
};

// Exported — also the display-label source for the Zone 1 filter bar's
// active-filter chips (DashboardFilterBar.tsx), so a status label is never
// spelled out twice.
export const MARITAL_LABEL: Record<AnalyticsProfile["maritalStatus"], string> = {
  single: "Single",
  married: "Married",
  widowed: "Widowed",
  divorced: "Divorced",
};

export const MENTORSHIP_LABEL: Record<AnalyticsProfile["mentorshipStatus"], string> = {
  not_enrolled: "Not enrolled",
  enrolled: "Enrolled",
  completed: "Completed",
};

export const LEADERSHIP_LABEL: Record<AnalyticsProfile["leadershipStage"], string> = {
  not_enrolled: "Not enrolled",
  level_1: "Level 1",
  level_2: "Level 2",
  advanced: "Advanced",
  completed: "Completed",
};

const sexDimension: Dimension = {
  key: "sex",
  label: "Sex",
  values: () => ["Male", "Female"],
  bucketsFor: (p) => [p.sex === "male" ? "Male" : "Female"],
};

const maritalStatusDimension: Dimension = {
  key: "maritalStatus",
  label: "Marital status",
  values: () => ["Single", "Married", "Widowed", "Divorced"],
  bucketsFor: (p) => [MARITAL_LABEL[p.maritalStatus]],
};

const ageBracketDimension: Dimension = {
  key: "ageBracket",
  label: "Age bracket",
  values: () => [...AGE_BUCKETS.map((b) => b.label), "Not shared"],
  bucketsFor: (p) => [ageBucketLabel(p.dateOfBirth) ?? "Not shared"],
};

const clanDimension: Dimension = {
  key: "clan",
  label: "Clan",
  // Map insertion order already matches clans' `by_order` index — see
  // DashboardClient's `clanNameById`, built by iterating the ordered query
  // result — so this doesn't need its own sort.
  values: (ctx) => [...ctx.clanNameById.values(), "Not set"],
  bucketsFor: (p, ctx) => [
    p.clanId ? (ctx.clanNameById.get(p.clanId) ?? "Not set") : "Not set",
  ],
};

const departmentDimension: Dimension = {
  key: "department",
  label: "Ministry (department)",
  values: (ctx) => [...ctx.departmentNameById.values(), "Not set"],
  bucketsFor: (p, ctx) =>
    p.departmentIds.length === 0
      ? ["Not set"]
      : p.departmentIds.map(
          (id) => ctx.departmentNameById.get(id) ?? "Not set",
        ),
};

const verificationStatusDimension: Dimension = {
  key: "verificationStatus",
  label: "Verification status",
  values: () => ["Pending", "Verified"],
  bucketsFor: (p) => [p.profileStatus === "verified" ? "Verified" : "Pending"],
};

const mentorshipStatusDimension: Dimension = {
  key: "mentorshipStatus",
  label: "Mentorship status",
  values: () => ["Not enrolled", "Enrolled", "Completed"],
  bucketsFor: (p) => [MENTORSHIP_LABEL[p.mentorshipStatus]],
};

const leadershipStageDimension: Dimension = {
  key: "leadershipStage",
  label: "Leadership stage",
  values: () => ["Not enrolled", "Level 1", "Level 2", "Advanced", "Completed"],
  bucketsFor: (p) => [LEADERSHIP_LABEL[p.leadershipStage]],
};

export const DIMENSIONS: Dimension[] = [
  sexDimension,
  maritalStatusDimension,
  ageBracketDimension,
  clanDimension,
  departmentDimension,
  verificationStatusDimension,
  mentorshipStatusDimension,
  leadershipStageDimension,
];

export function getDimension(key: string): Dimension {
  const dim = DIMENSIONS.find((d) => d.key === key);
  if (!dim) throw new Error(`Unknown dimension: ${key}`);
  return dim;
}

export type CrossTabResult = { rows: string[]; cols: string[]; matrix: number[][] };

/**
 * Tallies every profile into a rows × cols matrix for the two given
 * dimensions — the one function behind every "X by Y" chart on this
 * dashboard, curated or ad-hoc. `bucketsFor` returning more than one value
 * (department) means a single profile can add to more than one cell, same
 * as the hand-written `bucketAgeByDepartment` already did.
 */
export function crossTab(
  profiles: AnalyticsProfile[],
  rowDim: Dimension,
  colDim: Dimension,
  ctx: DimensionContext,
): CrossTabResult {
  const rows = rowDim.values(ctx);
  const cols = colDim.values(ctx);
  const rowIndex = new Map(rows.map((r, i) => [r, i]));
  const colIndex = new Map(cols.map((c, i) => [c, i]));
  const matrix = rows.map(() => cols.map(() => 0));

  for (const p of profiles) {
    for (const r of rowDim.bucketsFor(p, ctx)) {
      const ri = rowIndex.get(r);
      if (ri === undefined) continue;
      for (const c of colDim.bucketsFor(p, ctx)) {
        const ci = colIndex.get(c);
        if (ci === undefined) continue;
        matrix[ri][ci] += 1;
      }
    }
  }

  return { rows, cols, matrix };
}
