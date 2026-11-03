/**
 * The Library catalogue's shared contract (spec 0015).
 *
 * Every union, cap, threshold, error code and formatter the Library feature
 * depends on lives here rather than inside the Convex mutations that enforce
 * them, because three readers have to agree on the same values: the mutation
 * that refuses an over-long title, the portal form that counts characters and
 * stops the typist before they hit the cap, and the mobile screen that renders
 * a price. A cap defined privately in one of the three leaves the other two
 * guessing, which is how a form lets through a value the server then rejects
 * with no sentence to show for it.
 *
 * Follows the `profileLifecycle.ts` and `departmentShell.ts` pattern: raw
 * `as const` tuples with a derived type beside each, numeric caps as their own
 * exports, and no runtime dependency on React, React Native, Node or Convex
 * (AC-31).
 */

// ── The department ────────────────────────────────────────────────────────

/**
 * The seeded department name the whole feature keys off.
 *
 * Exported rather than written inline at each lookup because the name is
 * matched in four places — the `manageLibrary` capability grant, the three
 * `[slug]` pages' gate, the N43 recipient union, and the contact number the
 * member taps — and a typo in any one of them is a silent failure rather than
 * a compile error. It is the same literal that `ROSTER_PORTAL_DEPARTMENTS` in
 * `enums/departments.ts` carries.
 */
export const LIBRARY_DEPARTMENT_NAME = 'Library & Information';

// ── The physical/digital axis ─────────────────────────────────────────────

/**
 * How an item reaches the member: over the counter, or through the app.
 *
 * This is the axis the whole table splits on, not paid against free. A
 * `physical` item has a price and a stock count and no file; a `pdf` or
 * `audio` item has a file and neither of the other two. The invariant holds
 * for a row's whole life — an edit may move an item within one side of the
 * line but never across it (AC-8), so no edit can strand a price on a PDF or
 * a file key on a book.
 */
export const LIBRARY_ITEM_FORMATS = ['physical', 'pdf', 'audio'] as const;

export type LibraryItemFormat = (typeof LIBRARY_ITEM_FORMATS)[number];

/** The formats that carry a file and are free to open in the app. */
export const LIBRARY_DIGITAL_FORMATS = ['pdf', 'audio'] as const;

export type LibraryDigitalFormat = (typeof LIBRARY_DIGITAL_FORMATS)[number];

/** True for the two formats that carry a file rather than a price and a count. */
export function isDigitalLibraryFormat(
  format: LibraryItemFormat
): format is LibraryDigitalFormat {
  return format !== 'physical';
}

/**
 * What kind of thing the item is, independent of how it reaches the member.
 *
 * Two axes rather than one flat list because a teaching material exists both
 * as a printed manual on the shelf and as a PDF in the app, and collapsing the
 * two would mean describing the same teaching twice. The cost of the split is
 * that some pairs are nonsense — merchandise cannot be a PDF — which
 * {@link LIBRARY_PHYSICAL_ONLY_ITEM_TYPES} rules out in the mutation rather
 * than in the type system (AC-7).
 */
export const LIBRARY_ITEM_TYPES = [
  'book',
  'flash_disk_package',
  'teaching_material',
  'manual',
  'merchandise',
] as const;

export type LibraryItemType = (typeof LIBRARY_ITEM_TYPES)[number];

/**
 * The item types that only make sense as something you carry home.
 *
 * A flash disk package is a physical object with teachings on it (L1-02) and
 * merchandise is a shirt or a mug (L1-03). Neither has a digital form, so
 * pairing either with `pdf` or `audio` is refused.
 */
export const LIBRARY_PHYSICAL_ONLY_ITEM_TYPES = [
  'flash_disk_package',
  'merchandise',
] as const;

/** True when this type/format pair is one the catalogue allows (AC-7). */
export function isValidLibraryTypeFormat(
  itemType: LibraryItemType,
  format: LibraryItemFormat
): boolean {
  if (format === 'physical') return true;
  return !(LIBRARY_PHYSICAL_ONLY_ITEM_TYPES as readonly string[]).includes(
    itemType
  );
}

/** The member-facing label for each type, used by both surfaces' chip rows. */
export const LIBRARY_ITEM_TYPE_LABELS = {
  book: 'Book',
  flash_disk_package: 'Flash disk package',
  teaching_material: 'Teaching material',
  manual: 'Manual',
  merchandise: 'Merchandise',
} as const satisfies Record<LibraryItemType, string>;

/** The member-facing label for each format. */
export const LIBRARY_ITEM_FORMAT_LABELS = {
  physical: 'Physical',
  pdf: 'PDF',
  audio: 'Audio',
} as const satisfies Record<LibraryItemFormat, string>;

// ── Text caps ─────────────────────────────────────────────────────────────

/**
 * The longest an item title may be, after trimming.
 *
 * 160 characters: a book title plus its subtitle ("Praying the Promises: A
 * Forty Day Guide") fits comfortably, while a card can still render it in two
 * lines without the layout having to grow.
 */
export const LIBRARY_TITLE_MAX_LENGTH = 160;

/**
 * The longest an item description may be, after trimming.
 *
 * 2000 characters, far above the department description's 280, because this is
 * the blurb a member reads on the detail screen before deciding to walk to the
 * desk — a back-cover paragraph, not a one-line hint.
 */
export const LIBRARY_DESCRIPTION_MAX_LENGTH = 2000;

/** The longest an author or minister name may be, after trimming. */
export const LIBRARY_AUTHOR_MAX_LENGTH = 120;

/** The longest a category name may be, after trimming. */
export const LIBRARY_CATEGORY_NAME_MAX_LENGTH = 60;

/**
 * The longest one detail line may be, after trimming.
 *
 * A detail line is one entry in "Contains" for a flash disk package (L1-02) or
 * one entry in "Variants" for merchandise (L1-03): "Sunday evening series,
 * part 3" or "Navy, large". A sentence, not a paragraph.
 */
export const LIBRARY_DETAIL_LINE_MAX_LENGTH = 120;

/**
 * The most detail lines one item may carry.
 *
 * 20 is well above a shirt's size list and enough for a flash disk's track
 * listing. The cap exists because `detailLines` is an unbounded array on the
 * document, and a document with no ceiling on a field is a document that can
 * outgrow Convex's size limit.
 */
export const LIBRARY_DETAIL_LINES_MAX = 20;

/**
 * The longest note a stock movement may carry, after trimming.
 *
 * Deliberately the same 280 as a decline reason in `departmentShell.ts`, kept
 * as its own export for the same reason that one is: these are different
 * fields on different tables, and one of them changing should not silently
 * move the other. A note says why the count moved ("sold at the Sunday
 * service"), not what happened in detail.
 */
export const LIBRARY_STOCK_NOTE_MAX_LENGTH = 280;

// ── Price and quantity bounds ─────────────────────────────────────────────

/**
 * The price bounds, in whole shillings.
 *
 * Whole shillings rather than minor units because the Uganda shilling has no
 * subunit in practice — the same reason `COST_CURRENCIES.UGX` in
 * `costRegister.ts` carries exponent 0. The ceiling of 100,000,000 is not a
 * real-world price, it is a typo guard: it catches the extra zeros somebody
 * pastes into the field, while leaving every genuine price well inside.
 */
export const LIBRARY_PRICE_UGX_MIN = 0;
export const LIBRARY_PRICE_UGX_MAX = 100_000_000;

/**
 * The starting quantity bounds.
 *
 * Zero is allowed and meaningful: the team catalogues something that is on
 * order and not yet on the shelf, and the member sees "Out of stock" rather
 * than nothing at all (AC-16). The ceiling is a typo guard, as above.
 */
export const LIBRARY_STARTING_QUANTITY_MIN = 0;
export const LIBRARY_STARTING_QUANTITY_MAX = 1_000_000;

/**
 * The count at or below which N43 tells the Library team to restock.
 *
 * Ten, from SRS L3-03. The alert fires on the CROSSING, not on the state: a
 * movement that takes the count from above ten to at or below it sends one
 * notice and stamps `lowStockNotifiedAt`; further movements that leave it low
 * send nothing, including one that reaches zero; a movement that lifts it back
 * above ten clears the stamp so the next crossing alerts again (AC-26).
 *
 * Changing this number later leaves existing stamps set against the old one,
 * so the first crossing after a change may be missed on an already-stamped
 * item. Acceptable for a constant nobody expects to move.
 */
export const LIBRARY_LOW_STOCK_THRESHOLD = 10;

// ── Dashboard trends (spec 0017) ───────────────────────────────

/**
 * How many Kampala calendar months the dashboard trends cover.
 *
 * The newest bucket is the CURRENT month, so it is partial by nature and the
 * series is always exactly this many points: a month with nothing in it is a
 * zero and not a missing point (AC-10, AC-15).
 */
export const LIBRARY_TREND_MONTHS = 12;

/**
 * The rolling window for the "fastest moving" list, in days.
 *
 * Measured as `now - LIBRARY_MOVER_DAYS * 86_400_000`, which always sits
 * inside the twelve month read, so the list is a narrowing of that one result
 * rather than a second question put to the table (AC-16, AC-21).
 */
export const LIBRARY_MOVER_DAYS = 90;

/**
 * The hard ceiling on stock movements read in one dashboard query.
 *
 * Chosen against Convex's roughly sixteen thousand document read limit per
 * query, leaving room for the item reads in the same handler. At a realistic
 * few movements a day this is years of history, so reaching it means
 * something unusual is happening and the page says which month its coverage
 * actually begins at rather than quietly claiming to be merely partial
 * (AC-22, AC-23).
 */
export const LIBRARY_MOVEMENT_SCAN_CAP = 8_000;

// ── File limits ───────────────────────────────────────────────────────────

/**
 * The largest free content file the Library may upload, in bytes.
 *
 * 25 MB holds a long teaching PDF or roughly a 25 minute recording at a sane
 * bitrate. The limit is checked in the mutation against the size R2 reports
 * for the object, never against what the client claimed about the file, which
 * is what makes it an actual limit rather than a form hint (AC-18).
 */
export const LIBRARY_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** The largest cover image, in bytes. Capped separately and much lower. */
export const LIBRARY_COVER_MAX_BYTES = 5 * 1024 * 1024;

/**
 * The content types a free content file may be.
 *
 * An allowlist rather than a blocklist: `application/pdf` for a teaching,
 * `audio/mpeg` for an MP3 and `audio/mp4` for an M4A. Anything else is
 * refused, so the in-app viewer and player only ever meet a format they can
 * actually open.
 */
export const LIBRARY_FILE_CONTENT_TYPES = [
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
] as const;

export type LibraryFileContentType =
  (typeof LIBRARY_FILE_CONTENT_TYPES)[number];

/** The content types each digital format accepts, so the two cannot drift. */
export const LIBRARY_FORMAT_CONTENT_TYPES = {
  pdf: ['application/pdf'],
  audio: ['audio/mpeg', 'audio/mp4'],
} as const satisfies Record<LibraryDigitalFormat, readonly string[]>;

/** The prefix a cover image's content type must carry. */
export const LIBRARY_COVER_CONTENT_TYPE_PREFIX = 'image/';

/** True when `contentType` is one this catalogue will serve as free content. */
export function isLibraryFileContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  return (LIBRARY_FILE_CONTENT_TYPES as readonly string[]).includes(contentType);
}

/** True when `contentType` matches the format the operator chose. */
export function matchesLibraryFormat(
  format: LibraryDigitalFormat,
  contentType: string | undefined
): boolean {
  if (!contentType) return false;
  return (LIBRARY_FORMAT_CONTENT_TYPES[format] as readonly string[]).includes(
    contentType
  );
}

/** True when `contentType` is an image, which is all a cover has to be. */
export function isLibraryCoverContentType(
  contentType: string | undefined
): boolean {
  return (
    contentType !== undefined &&
    contentType.startsWith(LIBRARY_COVER_CONTENT_TYPE_PREFIX)
  );
}

/**
 * How long a signed file URL lives, in seconds.
 *
 * One hour: long enough to read a teaching or play a recording through
 * without the link expiring under the reader, and short enough that a link
 * that leaks out of the app stops working the same morning. The URL comes
 * from a one-shot action and is never persisted on a document or in client
 * state (AC-21).
 */
export const LIBRARY_FILE_URL_TTL_SECONDS = 60 * 60;

// ── Phone numbers ─────────────────────────────────────────────────────────

/**
 * The one phone format the portal accepts: E.164, `+` then up to 15 digits.
 *
 * One regex rather than two because the portal was about to grow a second
 * phone field — `departments.contactPhone` for the Library desk and Real
 * Estate's letting enquiries — beside `facilities.contactPhone`, which had
 * been unvalidated free text. Two formats mean two parsers, and the `wa.me`
 * link only works off one of them: `wa.me` wants the digits with no `+` and
 * no separators, `tel:` wants the stored value as is, and neither survives
 * "0700 123 456 (ask for Sarah)".
 *
 * Note the existing `facilities` rows predate this and are NOT guaranteed to
 * match; see spec 0015's follow-ups.
 */
export const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

/** True only for a value already in strict E.164 form. */
export function isE164Phone(value: string): boolean {
  return E164_PHONE_REGEX.test(value);
}

/**
 * What the operator typed, turned into E.164, or null when it cannot be.
 *
 * Normalising rather than refusing outright, because a human types a number
 * the way they say it — "+256 700 123 456", "+256-700-123456" — and refusing
 * that on a technicality teaches nothing. Spaces, dashes, dots, brackets and
 * non-breaking spaces come out; everything else has to already be right, so a
 * local number with no country code ("0700 123 456") is still refused rather
 * than guessed at, since guessing the country is how a congregation ends up
 * dialling the wrong continent.
 *
 * An empty or whitespace-only input returns the empty string, which is how a
 * caller clears the field (AC-29).
 */
export function normalizeE164Phone(raw: string): string | null {
  const stripped = raw.replace(/[\s .\-()]/g, '');
  if (stripped.length === 0) return '';
  return isE164Phone(stripped) ? stripped : null;
}

/**
 * The digits a `wa.me` link needs: E.164 with the leading `+` removed.
 *
 * `tel:` takes the stored value untouched; only WhatsApp wants it bare, so
 * the difference lives in this one function rather than in each caller
 * (AC-15).
 */
export function whatsAppDigits(e164: string): string {
  return e164.replace(/^\+/, '');
}

// ── Money ─────────────────────────────────────────────────────────────────

/**
 * A whole number of shillings rendered as money, e.g. 25000 → "USh 25,000".
 *
 * Deliberately produces exactly what `formatCostAmount(amount, 'UGX')` in
 * `costRegister.ts` produces, and there is a test asserting that parity: the
 * cost register and the Library catalogue are two different features, but a
 * member who sees "USh 25,000" on their phone and a System Admin who sees
 * "USh 25,000" in the register are looking at the same currency, and money
 * reading two ways in one product is the kind of detail that makes people
 * doubt both numbers.
 *
 * Not a thin re-export of `formatCostAmount` because the two take different
 * things: that one takes minor units and a currency code, this one takes whole
 * shillings and nothing else. They agree because the shilling's exponent is 0,
 * and the test is what keeps them agreeing if that ever stops being true.
 *
 * Grouping comes from `en-US` rather than the runtime default so the same
 * figure renders identically whatever locale the phone or browser reports.
 */
export function formatUgx(amountShillings: number): string {
  const formatted = amountShillings.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `USh ${formatted}`;
}

// ── Feed actions ──────────────────────────────────────────────────────────

/**
 * The `activityLogs.action` values the Library's own writes carry (AC-10).
 *
 * A separate set from `DEPARTMENT_FEED_ACTIONS` in `departmentShell.ts`
 * because these are not shell events: they are one department's operational
 * record, and no other department writes them. Shared for the same reason
 * that list is — the Convex mutations write these exact strings, the feed read
 * filters on them, and the portal turns each into a sentence, so a typo in any
 * one of the three is an entry that silently never appears.
 *
 * Adding an entry here means adding a sentence for it in the portal's feed
 * copy; the template map is typed on this union, so leaving it out does not
 * compile.
 */
export const LIBRARY_FEED_ACTIONS = [
  'library.item_created',
  'library.item_updated',
  'library.item_hidden',
  'library.item_removed',
  'library.stock_recorded',
  'library.category_changed',
] as const;

export type LibraryFeedAction = (typeof LIBRARY_FEED_ACTIONS)[number];

/** The `activityLogs.targetType` values the Library's writes use. */
export const LIBRARY_TARGET_TYPES = {
  item: 'libraryItem',
  category: 'libraryCategory',
} as const;

// ── Error codes ───────────────────────────────────────────────────────────

/**
 * Every refusal the Library's mutations can give, as a code rather than a
 * sentence.
 *
 * A code, not prose, because the sentence belongs to whichever surface is
 * showing it: the portal form puts it under the field that caused it, and a
 * future mobile surface would word it differently again. The server's job is
 * to say precisely which rule was broken (AC-7), and
 * {@link LIBRARY_ERROR_MESSAGES} below is the portal's default mapping rather
 * than the server's own wording.
 */
export const LIBRARY_ERROR_CODES = [
  // Item shape
  'LIBRARY_TITLE_REQUIRED',
  'LIBRARY_TITLE_TOO_LONG',
  'LIBRARY_DESCRIPTION_TOO_LONG',
  'LIBRARY_AUTHOR_TOO_LONG',
  'LIBRARY_DETAIL_LINE_TOO_LONG',
  'LIBRARY_DETAIL_LINES_TOO_MANY',
  'LIBRARY_TYPE_FORMAT_MISMATCH',
  'LIBRARY_FORMAT_IMMUTABLE',
  'LIBRARY_ITEM_NOT_FOUND',
  // Physical items
  'LIBRARY_PRICE_REQUIRED',
  'LIBRARY_PRICE_INVALID',
  'LIBRARY_QUANTITY_REQUIRED',
  'LIBRARY_QUANTITY_INVALID',
  // Digital items
  'LIBRARY_FILE_REQUIRED',
  'LIBRARY_FILE_TOO_LARGE',
  'LIBRARY_FILE_TYPE_UNSUPPORTED',
  'LIBRARY_COVER_TOO_LARGE',
  'LIBRARY_COVER_TYPE_UNSUPPORTED',
  // Categories
  'LIBRARY_CATEGORY_NOT_FOUND',
  'LIBRARY_CATEGORY_NAME_REQUIRED',
  'LIBRARY_CATEGORY_NAME_TOO_LONG',
  'LIBRARY_CATEGORY_DUPLICATE',
  'LIBRARY_CATEGORY_IN_USE',
  // Stock
  'LIBRARY_STOCK_NOT_PHYSICAL',
  'LIBRARY_STOCK_QUANTITY_INVALID',
  'LIBRARY_STOCK_INSUFFICIENT',
  'LIBRARY_STOCK_NOTE_TOO_LONG',
] as const;

export type LibraryErrorCode = (typeof LIBRARY_ERROR_CODES)[number];

/**
 * The department contact number's one refusal (AC-29).
 *
 * Not in {@link LIBRARY_ERROR_CODES} because the field is not Library's:
 * `departments.contactPhone` is generic, added in this feature because the
 * Library desk needs it, and Real Estate's letting enquiries need the same
 * field in the same week.
 */
export const DEPARTMENT_CONTACT_PHONE_INVALID =
  'DEPARTMENT_CONTACT_PHONE_INVALID';

/**
 * The portal's default sentence for each code.
 *
 * Typed as a total record, so adding a code without a sentence does not
 * compile. `LIBRARY_CATEGORY_IN_USE` is deliberately a prefix rather than a
 * whole sentence: the mutation appends how many items still use the category,
 * which is the only number that tells the operator what to do next (AC-11).
 */
export const LIBRARY_ERROR_MESSAGES = {
  LIBRARY_TITLE_REQUIRED: 'Give the item a title.',
  LIBRARY_TITLE_TOO_LONG: `Keep the title to ${LIBRARY_TITLE_MAX_LENGTH} characters.`,
  LIBRARY_DESCRIPTION_TOO_LONG: `Keep the description to ${LIBRARY_DESCRIPTION_MAX_LENGTH} characters.`,
  LIBRARY_AUTHOR_TOO_LONG: `Keep the author name to ${LIBRARY_AUTHOR_MAX_LENGTH} characters.`,
  LIBRARY_DETAIL_LINE_TOO_LONG: `Keep each detail line to ${LIBRARY_DETAIL_LINE_MAX_LENGTH} characters.`,
  LIBRARY_DETAIL_LINES_TOO_MANY: `Up to ${LIBRARY_DETAIL_LINES_MAX} detail lines.`,
  LIBRARY_TYPE_FORMAT_MISMATCH:
    'A flash disk package or merchandise has to be a physical item.',
  LIBRARY_FORMAT_IMMUTABLE:
    'A physical item cannot become a digital one, or the other way round. Remove this item and create the right one instead.',
  LIBRARY_ITEM_NOT_FOUND: 'That item is no longer in the catalogue.',
  LIBRARY_PRICE_REQUIRED: 'A physical item needs a price.',
  LIBRARY_PRICE_INVALID: `A price has to be a whole number of shillings between ${LIBRARY_PRICE_UGX_MIN} and ${LIBRARY_PRICE_UGX_MAX}.`,
  LIBRARY_QUANTITY_REQUIRED: 'A physical item needs a starting quantity.',
  LIBRARY_QUANTITY_INVALID: `A starting quantity has to be a whole number between ${LIBRARY_STARTING_QUANTITY_MIN} and ${LIBRARY_STARTING_QUANTITY_MAX}.`,
  LIBRARY_FILE_REQUIRED: 'Upload the PDF or recording first.',
  LIBRARY_FILE_TOO_LARGE: `That file is over ${Math.round(LIBRARY_FILE_MAX_BYTES / (1024 * 1024))} MB.`,
  LIBRARY_FILE_TYPE_UNSUPPORTED:
    'Free content has to be a PDF, an MP3 or an M4A.',
  LIBRARY_COVER_TOO_LARGE: `That cover image is over ${Math.round(LIBRARY_COVER_MAX_BYTES / (1024 * 1024))} MB.`,
  LIBRARY_COVER_TYPE_UNSUPPORTED: 'A cover has to be an image.',
  LIBRARY_CATEGORY_NOT_FOUND: 'That category is gone.',
  LIBRARY_CATEGORY_NAME_REQUIRED: 'Give the category a name.',
  LIBRARY_CATEGORY_NAME_TOO_LONG: `Keep the category name to ${LIBRARY_CATEGORY_NAME_MAX_LENGTH} characters.`,
  LIBRARY_CATEGORY_DUPLICATE: 'There is already a category with that name.',
  LIBRARY_CATEGORY_IN_USE: 'That category is still in use by',
  LIBRARY_STOCK_NOT_PHYSICAL: 'Only a physical item has a stock count.',
  LIBRARY_STOCK_QUANTITY_INVALID:
    'A movement has to be a whole number above zero.',
  LIBRARY_STOCK_INSUFFICIENT:
    'There are not that many on the shelf to take out.',
  LIBRARY_STOCK_NOTE_TOO_LONG: `Keep the note to ${LIBRARY_STOCK_NOTE_MAX_LENGTH} characters.`,
} as const satisfies Record<LibraryErrorCode, string>;

/**
 * The sentence for a code, or a fallback for anything the server said that
 * this build does not recognise.
 *
 * The fallback matters: a portal deployed a few minutes behind Convex can
 * genuinely meet a code it has never heard of, and showing the raw code is
 * better than showing nothing.
 */
export function libraryErrorMessage(code: string): string {
  return (
    (LIBRARY_ERROR_MESSAGES as Record<string, string>)[code] ??
    'That did not work. Try again.'
  );
}

/** True when `value` is one of the catalogue's own refusal codes. */
export function isLibraryErrorCode(value: string): value is LibraryErrorCode {
  return (LIBRARY_ERROR_CODES as readonly string[]).includes(value);
}
