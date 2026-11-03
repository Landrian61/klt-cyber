import { describe, expect, it } from 'vitest';
import { formatCostAmount } from '../costRegister';
import {
  E164_PHONE_REGEX,
  LIBRARY_COVER_MAX_BYTES,
  LIBRARY_DEPARTMENT_NAME,
  LIBRARY_DETAIL_LINES_MAX,
  LIBRARY_ERROR_CODES,
  LIBRARY_ERROR_MESSAGES,
  LIBRARY_FEED_ACTIONS,
  LIBRARY_FILE_CONTENT_TYPES,
  LIBRARY_FILE_MAX_BYTES,
  LIBRARY_ITEM_FORMATS,
  LIBRARY_ITEM_TYPES,
  LIBRARY_LOW_STOCK_THRESHOLD,
  LIBRARY_PHYSICAL_ONLY_ITEM_TYPES,
  LIBRARY_PRICE_UGX_MAX,
  LIBRARY_STARTING_QUANTITY_MAX,
  LIBRARY_TITLE_MAX_LENGTH,
  formatUgx,
  isDigitalLibraryFormat,
  isE164Phone,
  isLibraryCoverContentType,
  isLibraryErrorCode,
  isLibraryFileContentType,
  isValidLibraryTypeFormat,
  libraryErrorMessage,
  matchesLibraryFormat,
  normalizeE164Phone,
  whatsAppDigits,
} from '../library';
import { ROSTER_PORTAL_DEPARTMENTS } from '../../enums/departments';

// ── AC-31: the shared contract ────────────────────────────────────────────

describe('LIBRARY_DEPARTMENT_NAME (AC-31)', () => {
  it('is one of the roster portal departments', () => {
    // The whole authority thread assumes this: `manageLibrary` is granted on a
    // name match, and a roster member only resolves to a shell role inside a
    // ROSTER_PORTAL_DEPARTMENTS department. If the two literals ever drift,
    // every Library page silently 404s rather than failing loudly.
    expect(ROSTER_PORTAL_DEPARTMENTS as readonly string[]).toContain(
      LIBRARY_DEPARTMENT_NAME
    );
  });
});

describe('the format and type unions (AC-6, AC-7)', () => {
  it('carries the three formats and the five types', () => {
    expect(LIBRARY_ITEM_FORMATS).toEqual(['physical', 'pdf', 'audio']);
    expect(LIBRARY_ITEM_TYPES).toEqual([
      'book',
      'flash_disk_package',
      'teaching_material',
      'manual',
      'merchandise',
    ]);
  });

  it('treats pdf and audio as digital and physical as not', () => {
    expect(isDigitalLibraryFormat('pdf')).toBe(true);
    expect(isDigitalLibraryFormat('audio')).toBe(true);
    expect(isDigitalLibraryFormat('physical')).toBe(false);
  });

  it('refuses a physical-only type on a digital format', () => {
    for (const itemType of LIBRARY_PHYSICAL_ONLY_ITEM_TYPES) {
      expect(isValidLibraryTypeFormat(itemType, 'physical')).toBe(true);
      expect(isValidLibraryTypeFormat(itemType, 'pdf')).toBe(false);
      expect(isValidLibraryTypeFormat(itemType, 'audio')).toBe(false);
    }
  });

  it('allows every other type on every format', () => {
    const physicalOnly: readonly string[] = LIBRARY_PHYSICAL_ONLY_ITEM_TYPES;
    for (const itemType of LIBRARY_ITEM_TYPES) {
      if (physicalOnly.includes(itemType)) continue;
      for (const format of LIBRARY_ITEM_FORMATS) {
        expect(isValidLibraryTypeFormat(itemType, format)).toBe(true);
      }
    }
  });
});

describe('the caps and bounds (AC-31)', () => {
  it('holds the numbers the spec fixed', () => {
    expect(LIBRARY_TITLE_MAX_LENGTH).toBe(160);
    expect(LIBRARY_DETAIL_LINES_MAX).toBe(20);
    expect(LIBRARY_PRICE_UGX_MAX).toBe(100_000_000);
    expect(LIBRARY_STARTING_QUANTITY_MAX).toBe(1_000_000);
    expect(LIBRARY_LOW_STOCK_THRESHOLD).toBe(10);
    expect(LIBRARY_FILE_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(LIBRARY_COVER_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it('keeps the cover cap well under the file cap', () => {
    expect(LIBRARY_COVER_MAX_BYTES).toBeLessThan(LIBRARY_FILE_MAX_BYTES);
  });
});

describe('the content type allowlist (AC-18)', () => {
  it('accepts exactly PDF, MP3 and M4A', () => {
    expect(LIBRARY_FILE_CONTENT_TYPES).toEqual([
      'application/pdf',
      'audio/mpeg',
      'audio/mp4',
    ]);
    for (const contentType of LIBRARY_FILE_CONTENT_TYPES) {
      expect(isLibraryFileContentType(contentType)).toBe(true);
    }
  });

  it('refuses anything else, and a missing content type', () => {
    expect(isLibraryFileContentType('application/zip')).toBe(false);
    expect(isLibraryFileContentType('audio/wav')).toBe(false);
    expect(isLibraryFileContentType('image/png')).toBe(false);
    expect(isLibraryFileContentType(undefined)).toBe(false);
  });

  it('holds each format to its own content types', () => {
    expect(matchesLibraryFormat('pdf', 'application/pdf')).toBe(true);
    // An MP3 uploaded against the `pdf` format is the mismatch that would
    // otherwise send the browser sheet at an audio file.
    expect(matchesLibraryFormat('pdf', 'audio/mpeg')).toBe(false);
    expect(matchesLibraryFormat('audio', 'audio/mpeg')).toBe(true);
    expect(matchesLibraryFormat('audio', 'audio/mp4')).toBe(true);
    expect(matchesLibraryFormat('audio', 'application/pdf')).toBe(false);
    expect(matchesLibraryFormat('audio', undefined)).toBe(false);
  });

  it('accepts any image as a cover and nothing else', () => {
    expect(isLibraryCoverContentType('image/png')).toBe(true);
    expect(isLibraryCoverContentType('image/jpeg')).toBe(true);
    expect(isLibraryCoverContentType('image/webp')).toBe(true);
    expect(isLibraryCoverContentType('application/pdf')).toBe(false);
    expect(isLibraryCoverContentType(undefined)).toBe(false);
  });
});

// ── AC-31: the money formatter's parity with the cost register ────────────

describe('formatUgx (AC-31)', () => {
  it('renders whole shillings with grouping', () => {
    expect(formatUgx(25000)).toBe('USh 25,000');
    expect(formatUgx(0)).toBe('USh 0');
    expect(formatUgx(500)).toBe('USh 500');
    expect(formatUgx(1_250_000)).toBe('USh 1,250,000');
  });

  it('never shows a decimal, even on a fractional input', () => {
    // A price should never be fractional, but a bad migration or a hand-edited
    // row should still read as money rather than as "USh 25,000.5".
    expect(formatUgx(25000.5)).toBe('USh 25,001');
  });

  it('agrees with formatCostAmount(amount, "UGX") for every figure', () => {
    // The parity the spec asks for: the cost register and the catalogue are
    // different features, but a shilling has to read the same in both. UGX has
    // exponent 0, so a minor unit IS a whole shilling — and this test is what
    // catches it if that ever stops being true.
    for (const amount of [
      0, 1, 99, 500, 1000, 25000, 999_999, 1_250_000, LIBRARY_PRICE_UGX_MAX,
    ]) {
      expect(formatUgx(amount)).toBe(formatCostAmount(amount, 'UGX'));
    }
  });
});

// ── AC-29: the one phone format ───────────────────────────────────────────

describe('the shared E.164 validator (AC-29)', () => {
  it('accepts a well formed international number', () => {
    expect(isE164Phone('+256700123456')).toBe(true);
    expect(isE164Phone('+14155552671')).toBe(true);
    expect(E164_PHONE_REGEX.test('+256700123456')).toBe(true);
  });

  it('refuses separators, a missing plus, a leading zero and overlong input', () => {
    expect(isE164Phone('+256 700 123 456')).toBe(false);
    expect(isE164Phone('256700123456')).toBe(false);
    expect(isE164Phone('+0256700123456')).toBe(false);
    expect(isE164Phone('0700123456')).toBe(false);
    expect(isE164Phone('+2567001234567890')).toBe(false); // 16 digits
    expect(isE164Phone('')).toBe(false);
    expect(isE164Phone('+256700123abc')).toBe(false);
  });

  it('normalises the separators a human actually types', () => {
    expect(normalizeE164Phone('+256 700 123 456')).toBe('+256700123456');
    expect(normalizeE164Phone('+256-700-123456')).toBe('+256700123456');
    expect(normalizeE164Phone('+256 (700) 123.456')).toBe('+256700123456');
    expect(normalizeE164Phone(' +256700123456 ')).toBe('+256700123456');
  });

  it('clears on an empty or whitespace-only input', () => {
    expect(normalizeE164Phone('')).toBe('');
    expect(normalizeE164Phone('   ')).toBe('');
  });

  it('refuses rather than guesses a missing country code', () => {
    // Guessing "+256" here is how a congregation ends up dialling the wrong
    // continent, so a local number is a refusal, not a normalisation.
    expect(normalizeE164Phone('0700 123 456')).toBeNull();
    expect(normalizeE164Phone('ask for Sarah')).toBeNull();
    expect(normalizeE164Phone('+256 700 123 456 ext 4')).toBeNull();
  });

  it('strips only the plus for a wa.me link', () => {
    expect(whatsAppDigits('+256700123456')).toBe('256700123456');
    // Idempotent, so a value that somehow arrived bare is not mangled further.
    expect(whatsAppDigits('256700123456')).toBe('256700123456');
  });
});

// ── AC-10: the feed actions ───────────────────────────────────────────────

describe('LIBRARY_FEED_ACTIONS (AC-10)', () => {
  it('namespaces every action under library.', () => {
    for (const action of LIBRARY_FEED_ACTIONS) {
      expect(action.startsWith('library.')).toBe(true);
    }
  });

  it('has no duplicates', () => {
    expect(new Set(LIBRARY_FEED_ACTIONS).size).toBe(
      LIBRARY_FEED_ACTIONS.length
    );
  });
});

// ── AC-7: every refusal has a code and a sentence ─────────────────────────

describe('the error codes (AC-7)', () => {
  it('has no duplicates', () => {
    expect(new Set(LIBRARY_ERROR_CODES).size).toBe(LIBRARY_ERROR_CODES.length);
  });

  it('has a non-empty sentence for every code', () => {
    for (const code of LIBRARY_ERROR_CODES) {
      expect(LIBRARY_ERROR_MESSAGES[code]).toBeTruthy();
      expect(libraryErrorMessage(code)).toBe(LIBRARY_ERROR_MESSAGES[code]);
    }
  });

  it('falls back rather than rendering nothing for an unknown code', () => {
    // A portal deployed minutes behind Convex can genuinely meet a code it has
    // never heard of.
    expect(libraryErrorMessage('LIBRARY_SOMETHING_NEW')).toBe(
      'That did not work. Try again.'
    );
  });

  it('recognises its own codes and nothing else', () => {
    expect(isLibraryErrorCode('LIBRARY_STOCK_INSUFFICIENT')).toBe(true);
    expect(isLibraryErrorCode('DEPARTMENT_CONTACT_PHONE_INVALID')).toBe(false);
    expect(isLibraryErrorCode('Not authenticated')).toBe(false);
  });
});
