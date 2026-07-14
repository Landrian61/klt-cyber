import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/lib/api";

// Shared vocabulary for the user-detail sub-components: everything is derived
// from the server's return shape so the UI can never drift from the query.
export type UserDetail = NonNullable<
  FunctionReturnType<typeof api.admin.getUserDetail>
>;
export type ActiveRoleAssignment = UserDetail["activeRoles"][number];
export type PastRoleAssignment = UserDetail["pastRoles"][number];

/** "male" → "Male", "pending" → "Pending". */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * A short, human line from a thrown mutation error. Convex wraps server
 * throws in "[CONVEX …] Server Error Uncaught Error: <message> at handler…" —
 * surface just the message.
 */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const uncaught = raw.match(/Uncaught (?:Convex)?Error:\s*(.+)/);
  const line = (uncaught?.[1] ?? raw).split("\n")[0]?.trim() ?? "";
  const cleaned = line.replace(/\s+at\s+\S[\s\S]*$/, "").trim();
  return cleaned || "Something went wrong. Please try again.";
}

/** Card section heading — Inter, never the display face (spec §1.3). */
export function CardHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-body text-lg font-semibold text-on-surface">
      {children}
    </h2>
  );
}
