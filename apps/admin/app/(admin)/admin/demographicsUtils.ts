import type { Id } from "@/lib/api";

export type DemographicProfile = {
  sex: "male" | "female";
  maritalStatus: "single" | "married" | "widowed" | "divorced";
  dateOfBirth?: { day: number; month: number; year?: number };
  clanId?: Id<"clans">;
};

const AGE_BUCKETS = [
  { label: "Youth", min: 0, max: 17 },
  { label: "Young adult", min: 18, max: 30 },
  { label: "Adult", min: 31, max: 55 },
  { label: "Elder", min: 56, max: Infinity },
];

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

export function bucketMaritalStatus(profiles: DemographicProfile[]) {
  const counts: Record<string, number> = { single: 0, married: 0, other: 0 };
  for (const p of profiles) {
    if (p.maritalStatus === "single") counts.single += 1;
    else if (p.maritalStatus === "married") counts.married += 1;
    else counts.other += 1;
  }
  return [
    { label: "Single", count: counts.single },
    { label: "Married", count: counts.married },
    { label: "Other", count: counts.other },
  ].filter((d) => d.count > 0);
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
