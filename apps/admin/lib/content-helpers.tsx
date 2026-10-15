"use client";

import type { ReactNode } from "react";
import { Field as ShadcnField } from "@/components/shadcn/field";

/** A thrown mutation's human line -- strips Convex's server-error wrapper. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const uncaught = raw.match(/Uncaught (?:Convex)?Error:\s*(.+)/);
  const line = (uncaught?.[1] ?? raw).split("\n")[0]?.trim() ?? "";
  const cleaned = line.replace(/\s+at\s+\S[\s\S]*$/, "").trim();
  return cleaned || "Something went wrong. Please try again.";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** unix ms -> "YYYY-MM-DD" (local) for <input type="date">. */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" -> unix ms. `endOfDay` snaps to 23:59:59 for period ends. */
export function fromDateInput(value: string, endOfDay = false): number {
  if (!value) return Number.NaN;
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  return new Date(`${value}${suffix}`).getTime();
}

/** "12 Jul 2026" */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A labelled form field wrapper -- delegates to the shadcn Field primitive. */
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ShadcnField label={label} htmlFor={htmlFor ?? ""} hint={hint} className={className}>
      {children}
    </ShadcnField>
  );
}
