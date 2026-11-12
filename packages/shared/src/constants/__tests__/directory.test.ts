import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_COPY,
  DIRECTORY_ERROR_CODES,
  DIRECTORY_SHARED_FIELDS,
  DIRECTORY_SHARED_FIELD_LABELS,
  formatDirectoryBirthday,
  matchesDirectorySearch,
  normalizeMemberPhone,
} from '../directory';
import { whatsAppDigits } from '../library';

// Spec 0022, AC-10.
describe('normalizeMemberPhone', () => {
  it('turns a local 0 number into +256', () => {
    expect(normalizeMemberPhone('0772 123 456')).toBe('+256772123456');
  });

  it('turns 256 plus 9 digits into +256, ignoring brackets and dashes', () => {
    expect(normalizeMemberPhone('(256) 772-123456')).toBe('+256772123456');
  });

  it('keeps an already valid +256 number and strips dots and spaces', () => {
    expect(normalizeMemberPhone('+256 772.123.456')).toBe('+256772123456');
  });

  it('refuses a +256 number with a local 0 left in', () => {
    expect(normalizeMemberPhone('+2560772123456')).toBeNull();
  });

  it('keeps a valid foreign E.164 number untouched', () => {
    expect(normalizeMemberPhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('refuses something that is not a phone number', () => {
    expect(normalizeMemberPhone('12345')).toBeNull();
    expect(normalizeMemberPhone('call me')).toBeNull();
  });

  it('refuses a local number with the wrong length rather than guessing', () => {
    expect(normalizeMemberPhone('077212345')).toBeNull();
    expect(normalizeMemberPhone('07721234567')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(normalizeMemberPhone('')).toBeNull();
    expect(normalizeMemberPhone('   ')).toBeNull();
    expect(normalizeMemberPhone(undefined)).toBeNull();
  });

  it('gives digits WhatsApp accepts', () => {
    const normalized = normalizeMemberPhone('0772123456');
    expect(normalized && whatsAppDigits(normalized)).toBe('256772123456');
  });
});

// Spec 0022, AC-4 and AC-5.
describe('matchesDirectorySearch', () => {
  const grace = { name: { first: 'Grace', last: 'Nambi' } };

  it('matches everyone on an empty or blank query', () => {
    expect(matchesDirectorySearch(grace, '')).toBe(true);
    expect(matchesDirectorySearch(grace, '   ')).toBe(true);
  });

  it('matches word prefixes across name parts in any order', () => {
    expect(matchesDirectorySearch(grace, 'gra nam')).toBe(true);
    expect(matchesDirectorySearch(grace, 'nam gra')).toBe(true);
  });

  it('ignores case and extra spaces', () => {
    expect(matchesDirectorySearch(grace, '  GRACE   nambi ')).toBe(true);
  });

  it('needs every word to match', () => {
    expect(matchesDirectorySearch(grace, 'grace okello')).toBe(false);
  });

  it('matches the start of a part, not the middle', () => {
    expect(matchesDirectorySearch(grace, 'race')).toBe(false);
  });

  it('matches the middle name', () => {
    const row = { name: { first: 'Grace', middle: 'Akello', last: 'Nambi' } };
    expect(matchesDirectorySearch(row, 'ake')).toBe(true);
  });

  it('ignores accents on either side', () => {
    const row = { name: { first: 'Zoë', last: 'Mukasa' } };
    expect(matchesDirectorySearch(row, 'zoe')).toBe(true);
    expect(matchesDirectorySearch(grace, 'gráce')).toBe(true);
  });

  it('matches occupation only when the row carries it', () => {
    expect(matchesDirectorySearch({ ...grace, occupation: 'Civil Engineer' }, 'engi')).toBe(true);
    expect(matchesDirectorySearch(grace, 'engi')).toBe(false);
  });

  it('can mix a name word and an occupation word', () => {
    expect(matchesDirectorySearch({ ...grace, occupation: 'Nurse' }, 'grace nur')).toBe(true);
  });
});

describe('formatDirectoryBirthday', () => {
  it('formats day and month', () => {
    expect(formatDirectoryBirthday({ day: 12, month: 3 })).toBe('12 March');
    expect(formatDirectoryBirthday({ day: 1, month: 12 })).toBe('1 December');
  });

  it('gives an empty string for an impossible date rather than a wrong one', () => {
    expect(formatDirectoryBirthday({ day: 12, month: 13 })).toBe('');
    expect(formatDirectoryBirthday({ day: 0, month: 3 })).toBe('');
  });
});

describe('the directory contract', () => {
  it('labels every shared field, so the consent sheet lists them all', () => {
    for (const field of DIRECTORY_SHARED_FIELDS) {
      expect(DIRECTORY_SHARED_FIELD_LABELS[field]).toBeTruthy();
    }
    expect(Object.keys(DIRECTORY_SHARED_FIELD_LABELS)).toHaveLength(DIRECTORY_SHARED_FIELDS.length);
  });

  it('names the members only error code the queries throw', () => {
    expect(DIRECTORY_ERROR_CODES.MEMBERS_ONLY).toBe('DIRECTORY_MEMBERS_ONLY');
  });

  it('words the private note with the first name', () => {
    expect(DIRECTORY_COPY.targetPrivateNote('Grace')).toBe('Grace keeps their details private');
  });

  it('counts one member in the singular', () => {
    expect(DIRECTORY_COPY.resultsCount(1)).toBe('1 member');
    expect(DIRECTORY_COPY.resultsCount(4)).toBe('4 members');
  });
});
