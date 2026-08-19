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