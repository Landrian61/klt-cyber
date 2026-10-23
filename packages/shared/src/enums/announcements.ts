// The fixed set of announcement categories (spec 0010, AC-1 and AC-16).
//
// Fixed from an audit of what the church actually publishes rather than from a
// guess: these three are the only values any deployment holds. The schema field
// stays `v.optional(v.string())`, so widening this set later is one line here
// and no migration, and an existing row holding something off-set keeps
// rendering (see isAnnouncementCategory).
export const ANNOUNCEMENT_CATEGORIES = ["general", "event", "program"] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

// What the member and the portal editor actually read. Kept beside the set so a
// new category cannot ship with a raw lowercase key as its label.
export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  general: "General",
  event: "Event",
  program: "Program",
};

// Whether a stored value is one this build knows about.
//
// Deliberately a guard rather than a validator that throws: the app calls it on
// read, where an off-set value from an older row must degrade to a plain chip
// rather than break the screen, and the mutations call it on write, where the
// same false means reject. One rule, two different consequences.
export function isAnnouncementCategory(value: unknown): value is AnnouncementCategory {
  return (
    typeof value === "string" &&
    (ANNOUNCEMENT_CATEGORIES as readonly string[]).includes(value)
  );
}

// The label for a stored value, or null when it is not in the set.
//
// Null is the signal to render a neutral chip showing the raw value instead of
// a known one, which is what AC-1 asks for.
export function announcementCategoryLabel(value: string | undefined): string | null {
  return isAnnouncementCategory(value) ? ANNOUNCEMENT_CATEGORY_LABELS[value] : null;
}

// What a chip should read, for a stored value that may predate the fixed set.
//
// Returns null when there is no category at all, which is the signal to render
// no chip rather than an empty one. `known: false` means an off-set value: the
// chip still renders, in a neutral style, showing the stored word itself so a
// member sees what the row actually says (AC-1). Lives here rather than in each
// client so the app and the portal cannot disagree about what to show.
export function announcementCategoryChip(
  value: string | undefined,
): { label: string; known: boolean } | null {
  if (!value) return null;
  const known = announcementCategoryLabel(value);
  if (known) return { label: known, known: true };
  return { label: value.charAt(0).toUpperCase() + value.slice(1), known: false };
}
