// Shared display formatting for the admin portal. Pure functions — safe in
// both server and client components.

export interface NamedUser {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

/** "First Last", falling back to the email address. */
export function displayName(user: NamedUser | null | undefined): string {
  if (!user) return "Unknown user";
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || user.email;
}

/** Initials for avatars: from names when present, else the email prefix. */
export function initialsOf(user: NamedUser | null | undefined): string {
  if (!user) return "?";
  const first = user.firstName?.trim()?.[0];
  const last = user.lastName?.trim()?.[0];
  if (first || last) return `${first ?? ""}${last ?? ""}`.toUpperCase();
  return user.email.slice(0, 2).toUpperCase();
}

/** Human role label. Extend as new roleTypes ship (DATA_MODEL.md, Inc. 2). */
export function roleLabel(
  roleType: string,
  clanName?: string | null
): string {
  if (roleType === "system_admin") return "System Administrator";
  if (roleType === "clan_elder") return `Elder of Clan ${clanName ?? "—"}`;
  return roleType;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative time for feeds: "just now", "5m ago", "3h ago", "2d ago". */
export function formatRelativeTime(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  return formatDate(timestamp);
}

/** "12 Jul 2026" */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Tuesday, 14 July 2026" — the editorial dashboard subtitle date. */
export function formatLongDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Whole years since an ISO `YYYY-MM-DD` date, or null when unparseable. */
export function ageFrom(dateOfBirth: string): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hadBirthday =
    now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}
