import { PAUSED_DEPARTMENTS, slugifyDepartmentName } from "@klt-cyber/shared";

/**
 * Where a department's portal lives, in one place (spec 0012).
 *
 * The slug itself comes from `@klt-cyber/shared`, so the link this file builds
 * and the server side resolution behind `/areas-of-service/[slug]` can never
 * disagree about which department a slug names.
 *
 * Two departments are reached by a name other than their slug, because each
 * already has a bespoke portal of its own that predates the shared shell:
 * Administration's whole admin module lives under `/admin`, and Media's under
 * `/media` (which happens to match its slug, so it needs no override — the
 * static route simply wins over `[slug]`). Without the Administration entry,
 * typing `/areas-of-service/administration` would open a second, thinner portal
 * for a department that already has a full one.
 */
export const DEPARTMENT_SLUG_OVERRIDES: Record<string, string> = {
  Administration: "admin",
};

// There is deliberately NO runtime guard turning `/areas-of-service/
// administration` into `/areas-of-service/admin`: `next.config.ts` already
// redirects that path and its sub-paths at the edge, before middleware and
// before any layout runs. A guard in the shell layout would be unreachable.
// This map exists so a link goes straight to the real path and skips the
// redirect hop, not to enforce it.

/** The slug a department's portal is actually reached by. */
export function departmentSlug(departmentName: string): string {
  return (
    DEPARTMENT_SLUG_OVERRIDES[departmentName] ??
    slugifyDepartmentName(departmentName)
  );
}

/** The path to a department's portal. */
export function departmentHref(departmentName: string): string {
  return `/areas-of-service/${departmentSlug(departmentName)}`;
}

/**
 * True for a department that has not opened yet and keeps its "Coming soon"
 * page rather than entering the shell (AC-1).
 *
 * Derived from the shared list of paused names, so the portal and
 * `getShellContext` agree on which departments are open without a round trip.
 */
export function isPausedSlug(slug: string): boolean {
  return (PAUSED_DEPARTMENTS as readonly string[]).some(
    (name) => slugifyDepartmentName(name) === slug
  );
}

/**
 * Whether the caller can actually open a department's portal.
 *
 * One rule covers every department, bespoke portal or shared shell alike:
 * a System Admin, or that department's own HOD or delegate. Verified against
 * the three gates that exist (`hasAdministrationAccess` and `hasMediaAccess`
 * in convex/profile.ts, and `getShellContext` in convex/departmentShell.ts),
 * which all resolve to exactly this set.
 *
 * Being on a department's ROSTER is deliberately not enough. A roster member
 * of Media, Hospitality or Library gets through the portal's front door
 * (spec 0006's `hasPortalAccess`) so they reach the hub, but SRS 4.9.2 gives
 * them no pages inside any department, and every department layout turns them
 * around. The hub and the switcher both read this, so neither offers a way in
 * that would bounce straight back out.
 *
 * `roles` and `isSystemAdmin` come from
 * `departmentMemberships.listMyDepartmentsForHub`, which is the one query both
 * surfaces read, so they cannot disagree about who may go where.
 */
export function canEnterDepartment(
  roles: readonly string[],
  isSystemAdmin: boolean
): boolean {
  return (
    isSystemAdmin || roles.includes("hod") || roles.includes("department_admin")
  );
}

/** True for a department that has not opened yet, by name rather than slug. */
export function isPausedDepartment(departmentName: string): boolean {
  return (PAUSED_DEPARTMENTS as readonly string[]).includes(departmentName);
}
