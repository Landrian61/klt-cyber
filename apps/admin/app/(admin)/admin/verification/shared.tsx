import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/api";

export type ProfileForReview = NonNullable<
  FunctionReturnType<typeof api.memberProfiles.getProfileForReview>
>;
// The subset of `memberProfiles` fields an admin can correct before
// approving, per `profileEditsPatchValidator` in convex/memberProfiles.ts.
// Shared by the detail page and Review mode so both submit identical edits.
export type EditableFields = {
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  sex: "male" | "female";
  maritalStatus: "single" | "married" | "widowed" | "divorced";
  occupation: string;
  industry: string;
  employer: string;
  shortBio: string;
};

export function toFormState(profile: ProfileForReview): EditableFields {
  return {
    firstName: profile.firstName,
    middleName: profile.middleName ?? "",
    lastName: profile.lastName,
    phone: profile.phone ?? "",
    sex: profile.sex,
    maritalStatus: profile.maritalStatus,
    occupation: profile.occupation ?? "",
    industry: profile.industry ?? "",
    employer: profile.employer ?? "",
    shortBio: profile.shortBio ?? "",
  };
}

// Shared by every screen that lists or displays a submitted profile, so name
// formatting can't drift between the queue, the detail page, and Review mode.
export function fullName(p: {
  firstName: string;
  middleName?: string;
  lastName: string;
}): string {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "5 Mar 1994", or "5 Mar" when the member declined to share a birth year. */
export function formatDateOfBirth(
  dob?: { day: number; month: number; year?: number } | null,
): string | null {
  if (!dob) return null;
  const month = MONTH_NAMES[dob.month - 1] ?? String(dob.month);
  return dob.year ? `${dob.day} ${month} ${dob.year}` : `${dob.day} ${month}`;
}

/** "Plot 12, Ntinda Rd, Kampala, Uganda" — skips parts the member left blank. */
export function formatAddress(
  address?: {
    line1: string;
    city?: string;
    district?: string;
    country?: string;
  } | null,
): string | null {
  if (!address) return null;
  return [address.line1, address.city, address.district, address.country]
    .filter(Boolean)
    .join(", ");
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const uncaught = raw.match(/Uncaught (?:Convex)?Error:\s*(.+)/);
  const line = (uncaught?.[1] ?? raw).split("\n")[0]?.trim() ?? "";
  const cleaned = line.replace(/\s+at\s+\S[\s\S]*$/, "").trim();
  return cleaned || "Something went wrong. Please try again.";
}