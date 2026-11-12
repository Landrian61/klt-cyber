import { describe, expect, it } from 'vitest';
import { profileEditSchema } from '../profile';
import {
  type EditableProfile,
  diffProfileEdit,
  editValuesEqual,
  normalizeProfileEditDraft,
  profileEditDraftFrom,
} from '../profileEdit';

// Spec 0023, AC-8, AC-9, AC-27.

const STORED: EditableProfile = {
  firstName: 'Ruth',
  lastName: 'Nabirye',
  sex: 'female',
  maritalStatus: 'married',
  dateOfBirth: { day: 12, month: 3, year: 1990 },
  phone: '+256772123456',
  photoUrl: 'profiles/ruth.jpg',
  address: { line1: 'Plot 4', city: 'Kampala' },
  spouseUserId: 'user_spouse',
  nextOfKin: { fullName: 'Amos', relationship: 'Brother', phone: '+256700000001' },
  mentorshipStatus: 'enrolled',
  occupation: 'Engineer',
  skills: ['Sound', 'Design'],
};

function draft(overrides: Partial<ReturnType<typeof profileEditDraftFrom>> = {}) {
  return { ...profileEditDraftFrom(STORED), ...overrides };
}

function diffOf(overrides: Partial<ReturnType<typeof profileEditDraftFrom>>) {
  return diffProfileEdit(
    normalizeProfileEditDraft(profileEditDraftFrom(STORED)),
    normalizeProfileEditDraft(draft(overrides))
  );
}

describe('diffProfileEdit', () => {
  it('sends nothing when nothing changed', () => {
    const diff = diffOf({});
    expect(diff.isEmpty).toBe(true);
    expect(diff.changes).toEqual({});
    expect(diff.clearFields).toEqual([]);
  });

  it('sends only the changed fields', () => {
    const diff = diffOf({ phone: '+256772999999', occupation: 'Teacher' });
    expect(diff.changes).toEqual({ phone: '+256772999999', occupation: 'Teacher' });
    expect(diff.clearFields).toEqual([]);
  });

  it('never sends an untouched photoUrl or mentorshipStatus', () => {
    const diff = diffOf({ shortBio: 'Hello' });
    expect('photoUrl' in diff.changes).toBe(false);
    expect('mentorshipStatus' in diff.changes).toBe(false);
  });

  it('sends a new photo key when the photo changed', () => {
    expect(diffOf({ photoUrl: 'profiles/new.jpg' }).changes).toEqual({
      photoUrl: 'profiles/new.jpg',
    });
  });

  it('sends a whole object when one part of it changed', () => {
    const diff = diffOf({
      address: { line1: 'Plot 4', city: 'Entebbe', district: '', country: '' },
    });
    expect(diff.changes).toEqual({ address: { line1: 'Plot 4', city: 'Entebbe' } });
  });

  it('compares skills by value, not by array identity', () => {
    expect(diffOf({ skills: ['Sound', 'Design'] }).isEmpty).toBe(true);
    expect(diffOf({ skills: ['Design', 'Sound'] }).changes).toEqual({
      skills: ['Design', 'Sound'],
    });
  });

  it('clears a field emptied entirely', () => {
    const diff = diffOf({
      phone: '  ',
      address: { line1: '', city: '', district: '', country: '' },
      skills: [],
    });
    expect(diff.changes).toEqual({});
    expect(diff.clearFields.sort()).toEqual(['address', 'phone', 'skills']);
  });

  it('swaps a linked spouse for an unlinked name in both directions', () => {
    const toUnlinked = diffOf({ spouseUserId: undefined, spouseNameUnlinked: 'Peter' });
    expect(toUnlinked.changes).toEqual({ spouseNameUnlinked: 'Peter' });
    expect(toUnlinked.clearFields).toEqual(['spouseUserId']);

    const fromUnlinked = diffProfileEdit(
      { ...STORED, spouseUserId: undefined, spouseNameUnlinked: 'Peter' },
      { ...STORED, spouseUserId: 'user_other', spouseNameUnlinked: undefined }
    );
    expect(fromUnlinked.changes).toEqual({ spouseUserId: 'user_other' });
    expect(fromUnlinked.clearFields).toEqual(['spouseNameUnlinked']);
  });

  it('does not treat a phone typed locally as a change when it normalizes the same', () => {
    const local = { ...STORED, phone: '0772123456' };
    const diff = diffProfileEdit(
      normalizeProfileEditDraft(profileEditDraftFrom(local)),
      normalizeProfileEditDraft({ ...profileEditDraftFrom(local), occupation: 'Pilot' })
    );
    expect(diff.changes).toEqual({ occupation: 'Pilot' });
  });

  it('never clears a required field', () => {
    const diff = diffOf({ firstName: '' });
    expect(diff.clearFields).not.toContain('firstName' as never);
    expect(diff.changes).toEqual({ firstName: '' });
  });
});

describe('editValuesEqual', () => {
  it('compares nested objects and arrays by value', () => {
    expect(editValuesEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(editValuesEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
    expect(editValuesEqual(undefined, '')).toBe(false);
  });
});

describe('profileEditSchema', () => {
  const valid = () => draft();

  it('accepts the stored profile as a draft', () => {
    expect(profileEditSchema.safeParse(valid()).success).toBe(true);
  });

  it('rejects a blank or overlong first or last name', () => {
    expect(profileEditSchema.safeParse({ ...valid(), firstName: '   ' }).success).toBe(false);
    expect(profileEditSchema.safeParse({ ...valid(), lastName: 'x'.repeat(51) }).success).toBe(
      false
    );
    expect(profileEditSchema.safeParse({ ...valid(), lastName: 'x'.repeat(50) }).success).toBe(
      true
    );
  });

  it('accepts an empty, local or international phone and rejects nonsense', () => {
    for (const phone of ['', '0772 123456', '+256772123456', '+447911123456']) {
      expect(profileEditSchema.safeParse({ ...valid(), phone }).success).toBe(true);
    }
    for (const phone of ['12', 'call me', '+2560772123456']) {
      expect(profileEditSchema.safeParse({ ...valid(), phone }).success).toBe(false);
    }
  });

  it('caps the short bio at 280 characters', () => {
    expect(profileEditSchema.safeParse({ ...valid(), shortBio: 'x'.repeat(280) }).success).toBe(
      true
    );
    expect(profileEditSchema.safeParse({ ...valid(), shortBio: 'x'.repeat(281) }).success).toBe(
      false
    );
  });

  it('checks the date of birth parts and refuses a future year', () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(
      profileEditSchema.safeParse({ ...valid(), dateOfBirth: { day: 0, month: 3 } }).success
    ).toBe(false);
    expect(
      profileEditSchema.safeParse({ ...valid(), dateOfBirth: { day: 5, month: 13 } }).success
    ).toBe(false);
    expect(
      profileEditSchema.safeParse({ ...valid(), dateOfBirth: { day: 5, month: 3, year: nextYear } })
        .success
    ).toBe(false);
    expect(
      profileEditSchema.safeParse({ ...valid(), dateOfBirth: { day: 5, month: 3 } }).success
    ).toBe(true);
    expect(profileEditSchema.safeParse({ ...valid(), dateOfBirth: undefined }).success).toBe(true);
  });

  it('needs line 1 once any part of the address is filled', () => {
    const result = profileEditSchema.safeParse({
      ...valid(),
      address: { line1: '', city: 'Kampala', district: '', country: '' },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['address', 'line1']);
    expect(
      profileEditSchema.safeParse({
        ...valid(),
        address: { line1: '', city: '', district: '', country: '' },
      }).success
    ).toBe(true);
  });

  it('needs all three next of kin parts once any is filled', () => {
    const result = profileEditSchema.safeParse({
      ...valid(),
      nextOfKin: { fullName: 'Amos', relationship: '', phone: '' },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ['nextOfKin', 'relationship'],
      ['nextOfKin', 'phone'],
    ]);
    expect(
      profileEditSchema.safeParse({
        ...valid(),
        nextOfKin: { fullName: '', relationship: '', phone: '' },
      }).success
    ).toBe(true);
  });
});
