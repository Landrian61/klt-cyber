import {
  PAUSED_DEPARTMENTS,
  LEADERS_ONLY_PORTAL_DEPARTMENTS,
  ROSTER_PORTAL_DEPARTMENTS,
  slugifyDepartmentName,
} from "@klt-cyber/shared";

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
 * A System Admin, or that department's own HOD or delegate — and, since spec
 * 0015, a VERIFIED roster member of Media, Hospitality or Library &
 * Information. Verified against the gates that exist
 * (`hasAdministrationAccess` and `hasMediaAccess` in convex/profile.ts, and
 * `getShellContext` in convex/departmentShell.ts), which all resolve to
 * exactly this set.
 *
 * That last clause is what finally makes F3-19 work. A roster member of those
 * three departments has always got through the portal's front door (spec
 * 0006's `hasPortalAccess`) and so reached the hub — but every department
 * layout then turned them around, because `resolveDepartmentShellRole` gave
 * them no role. The hub and the switcher read this function precisely so they
 * do not offer a door that bounces straight back out, so until the shell grew
 * a `roster` role the honest answer here was false. Now it is true for the two
 * that use the shared `[slug]` shell, and the layout lets them in.
 *
 * Media is the exception, and subtracted by name through
 * `LEADERS_ONLY_PORTAL_DEPARTMENTS`. Being on Media's roster does grant the
 * `roster` role, but Media's portal is not the shared shell: it is a bespoke
 * pair of content management pages gated on `hasMediaAccess`
 * (`convex/profile.ts`), which this change deliberately did NOT widen. Saying
 * true for Media would reintroduce exactly the bouncing door this function
 * exists to prevent, one layer further in. SRS F3-19 records the narrowing.
 *
 * SRS 4.9.2 is still intact: what a `roster` role may DO inside is nothing at
 * all, bar a department-scoped capability its own department grants (today,
 * Library's catalogue). Entering is not the same as being handed the roster.
 *
 * `department` is optional so a caller that does not know which department it
 * is asking about keeps the narrower, appointment-only answer rather than
 * silently getting the wider one. Both real call sites pass it. Its
 * `profileVerified` flag cannot be inferred from `hasPortalAccess` having let
 * the caller this far: someone holding an unrelated active role passes that
 * gate with an unverified profile, and the shell would turn them around.
 *
 * `roles`, `isSystemAdmin` and `profileVerified` all come from
 * `departmentMemberships.listMyDepartmentsForHub`, which is the one query both
 * surfaces read, so they cannot disagree about who may go where.
 */
export function canEnterDepartment(
  roles: readonly string[],
  isSystemAdmin: boolean,
  department?: { name: string; profileVerified: boolean }
): boolean {
  if (isSystemAdmin) return true;
  if (roles.includes("hod") || roles.includes("department_admin")) return true;
  if (!department) return false;
  return (
    roles.includes("member") &&
    department.profileVerified &&
    (ROSTER_PORTAL_DEPARTMENTS as readonly string[]).includes(department.name) &&
    // Media grants the `roster` role but its portal is bespoke and leaders
    // only, so offering it here would be a linked tile that Media's own layout
    // redirects straight back out of. See LEADERS_ONLY_PORTAL_DEPARTMENTS.
    !(LEADERS_ONLY_PORTAL_DEPARTMENTS as readonly string[]).includes(
      department.name
    )
  );
}

/** True for a department that has not opened yet, by name rather than slug. */
export function isPausedDepartment(departmentName: string): boolean {
  return (PAUSED_DEPARTMENTS as readonly string[]).includes(departmentName);
}
