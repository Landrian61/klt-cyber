/**
 * Member directory with share to see contact details (SRS M5-01 to M5-05,
 * F2-13, NF-02, spec 0022).
 *
 * The pure half of the feature: the error code, the copy every surface shows,
 * the phone normalizer the card's Call and WhatsApp buttons use, and the
 * search matcher the list runs in memory. The privacy gate itself is NOT
 * here: it lives on the server (`convex/lib/directory.ts`), because a rule the
 * client enforces is a rule anybody with the client can switch off.
 */

import { normalizeE164Phone } from './library';

// ── Errors ────────────────────────────────────────────────────────────────

/**
 * Every refusal the directory queries can give. One today: the directory is
 * for verified members only (AC-2). A code, not a sentence, so each surface
 * words it its own way.
 */
export const DIRECTORY_ERROR_CODES = {
  MEMBERS_ONLY: 'DIRECTORY_MEMBERS_ONLY',
} as const;

export type DirectoryErrorCode =
  (typeof DIRECTORY_ERROR_CODES)[keyof typeof DIRECTORY_ERROR_CODES];

// ── What sharing discloses ───────────────────────────────────────────────

/**
 * The fields a sharing member discloses to other sharing members, in the order
 * the card shows them (AC-7). The consent sheet lists exactly these (AC-12),
 * so the server allowlist in `convex/lib/directory.ts` and the words a member
 * agrees to are the same list. Change one, change the other in the same edit.
 */
export const DIRECTORY_SHARED_FIELDS = [
  'phone',
  'email',
  'occupation',
  'industry',
  'employer',
  'skills',
  'shortBio',
  'birthday',
] as const;

export type DirectorySharedField = (typeof DIRECTORY_SHARED_FIELDS)[number];

export const DIRECTORY_SHARED_FIELD_LABELS: Record<DirectorySharedField, string> = {
  phone: 'Phone number',
  email: 'Email address',
  occupation: 'Occupation',
  industry: 'Industry',
  employer: 'Employer',
  skills: 'Skills',
  shortBio: 'Short bio',
  birthday: 'Birthday (day and month only)',
};

// ── Copy ─────────────────────────────────────────────────────────────────

/**
 * Every member facing string the directory shows, named, so the list banner,
 * the card note, the consent sheet and (later) My Profile's toggle all say the
 * same thing (spec 0022 follow-up: feature 14 reuses this).
 */
export const DIRECTORY_COPY = {
  title: 'Members',
  selfLabel: 'You',
  searchPlaceholder: 'Search by name',
  searchPlaceholderSharing: 'Search by name or occupation',
  resultsCount: (count: number) => (count === 1 ? '1 member' : `${count} members`),
  contactMarkLabel: 'Shares contact details',
  filters: {
    department: 'Area of Service',
    clan: 'Clan',
    clear: 'Clear',
  },
  empty: {
    title: 'No members match',
    body: 'Try another name, or clear your filters.',
    action: 'Clear filters',
  },
  emptyDirectory: {
    title: 'No other members yet',
    body: 'As members are verified, they will appear here.',
  },
  privateBanner: {
    title: 'Your details are private',
    body: 'Share your own details to see the contact details of other members who share.',
    action: 'Turn on sharing',
  },
  privateViewerNote:
    'Share your own details to see how to reach members who share theirs.',
  targetPrivateNote: (firstName: string) => `${firstName} keeps their details private`,
  notFound: {
    title: "This member isn't in the directory",
    body: 'They may have left, or their profile is not verified yet.',
  },
  /** Shown when the server refuses the viewer (DIRECTORY_MEMBERS_ONLY), e.g. a member whose profile is not verified. */
  membersOnly: {
    title: 'The directory opens once you are verified',
    body: 'When the Administration team verifies your profile, you will find the other members here.',
  },
  /** The card's label for a shared birthday; the consent sheet uses the longer field label. */
  birthdayLabel: 'Birthday',
  ownCard: {
    caption: 'This is how other sharing members see you.',
    switchLabel: 'Share my details with other members',
    switchOnBody: 'Other sharing members can see your contact details.',
    switchOffBody: 'Only your name, photo, clan and Areas of Service show.',
  },
  consent: {
    title: 'Share your details?',
    body: 'Only other members who also share will see these. You can turn this off any time.',
    confirm: 'Share my details',
    cancel: 'Not now',
  },
  actions: {
    call: 'Call',
    whatsapp: 'WhatsApp',
    email: 'Email',
  },
} as const;

// ── Phone ────────────────────────────────────────────────────────────────

/** Uganda's country code, the one country this normalizer is willing to guess. */
const UGANDA_PREFIX = '+256';

/**
 * A member's typed phone number in E.164, or null when it cannot be (AC-10).
 *
 * Separate from `normalizeE164Phone` on purpose: that one refuses to guess a
 * country, which is right for a facility contact an operator types. A member
 * phone is almost always Ugandan and typed the way people say it, so this one
 * guesses: `0` plus 9 digits and `256` plus 9 digits both become `+256` plus
 * the 9 digits. Anything already starting `+256` must be exactly `+256` plus 9
 * digits, so `+2560772123456` (a local `0` left in) is refused rather than
 * dialled. Everything else defers to `normalizeE164Phone`.
 */
export function normalizeMemberPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/[\s.\-()]/g, '');
  if (stripped.length === 0) return null;

  let candidate = stripped;
  if (/^0\d{9}$/.test(stripped)) candidate = UGANDA_PREFIX + stripped.slice(1);
  else if (/^256\d{9}$/.test(stripped)) candidate = '+' + stripped;

  if (candidate.startsWith(UGANDA_PREFIX) && !/^\+256\d{9}$/.test(candidate)) {
    return null;
  }
  const normalized = normalizeE164Phone(candidate);
  return normalized ? normalized : null;
}

// ── Search ───────────────────────────────────────────────────────────────

/** Lowercased, accents stripped (NFD with combining marks removed), trimmed. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function words(value: string | undefined): string[] {
  if (!value) return [];
  return fold(value).split(/\s+/).filter((word) => word.length > 0);
}

export interface DirectorySearchRow {
  name: { first: string; middle?: string; last: string };
  /** Present only when the server sent it, i.e. both sides share (AC-5). */
  occupation?: string;
}

/**
 * Whether a directory row matches what was typed (AC-4, AC-5).
 *
 * Every typed word must match the start of some word of the name (first,
 * middle or last), or of the occupation when the row carries one, so
 * "gra nam" finds Grace Nambi. Case, extra spaces and accents are ignored. An
 * empty query matches everyone. The occupation only takes part when it is in
 * the row, which the server allows only between two sharers, so a private
 * viewer can never find anyone by occupation.
 */
export function matchesDirectorySearch(row: DirectorySearchRow, query: string): boolean {
  const typed = words(query);
  if (typed.length === 0) return true;
  const haystack = [
    ...words(row.name.first),
    ...words(row.name.middle),
    ...words(row.name.last),
    ...words(row.occupation),
  ];
  return typed.every((word) => haystack.some((part) => part.startsWith(word)));
}

// ── Birthday ─────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * A shared birthday as "12 March" (AC-7). Never takes a year: the directory
 * never sends one. An out of range month gives an empty string rather than a
 * wrong date.
 */
export function formatDirectoryBirthday(birthday: { day: number; month: number }): string {
  const month = MONTH_NAMES[birthday.month - 1];
  if (!month || !Number.isInteger(birthday.day) || birthday.day < 1 || birthday.day > 31) {
    return '';
  }
  return `${birthday.day} ${month}`;
}
