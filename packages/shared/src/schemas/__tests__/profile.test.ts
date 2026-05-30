import { describe, it, expect } from 'vitest';
import {
  approvalStateShape,
  childInputSchema,
  profileCompletionInputSchema,
  profileUpdateInputSchema,
} from '../profile';

// Unit tests for the profile validators (shared by the mobile profile-completion
// flow and the Convex mutations). DATA_MODEL.md, Increment 2: sex + maritalStatus
// required at completion; everything else optional; sex is NOT a member-editable
// field; children carry a required ageBracket.

describe('approvalStateShape', () => {
  it('accepts a bare pending state', () => {
    expect(approvalStateShape.safeParse({ status: 'pending' }).success).toBe(true);
  });

  it('accepts a fully-populated verified state', () => {
    const result = approvalStateShape.safeParse({
      status: 'verified',
      verifiedBy: 'user_123',
      verifiedAt: 1735689600000,
      note: 'Confirmed in person',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(approvalStateShape.safeParse({ status: 'approved' }).success).toBe(false);
  });
});

describe('childInputSchema', () => {
  const validChild = { name: 'Esther', ageBracket: '0-12' as const };

  it('accepts name + ageBracket only', () => {
    expect(childInputSchema.safeParse(validChild).success).toBe(true);
  });

  it('accepts an optional ISO dateOfBirth and guardianContact', () => {
    const result = childInputSchema.safeParse({
      ...validChild,
      dateOfBirth: '2015-06-01',
      guardianContact: '+256700000000',
    });
    expect(result.success).toBe(true);
  });

  it('trims the name', () => {
    const result = childInputSchema.safeParse({ ...validChild, name: '  Esther  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Esther');
  });

  it('rejects a missing ageBracket', () => {
    expect(childInputSchema.safeParse({ name: 'Esther' }).success).toBe(false);
  });

  it('rejects an invalid ageBracket', () => {
    expect(childInputSchema.safeParse({ ...validChild, ageBracket: '40+' }).success).toBe(false);
  });

  it('rejects a non-ISO dateOfBirth', () => {
    const result = childInputSchema.safeParse({ ...validChild, dateOfBirth: '01/06/2015' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(childInputSchema.safeParse({ ...validChild, name: '' }).success).toBe(false);
  });
});

describe('profileCompletionInputSchema', () => {
  const minimal = { sex: 'female' as const, maritalStatus: 'single' as const };

  it('accepts the minimal required pair (sex + maritalStatus)', () => {
    expect(profileCompletionInputSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts a full payload with clan, names, dob, phone and children', () => {
    const result = profileCompletionInputSchema.safeParse({
      ...minimal,
      dateOfBirth: '1998-04-23',
      phone: '+256700111222',
      clanId: 'clan_reuben',
      firstName: 'Grace',
      lastName: 'Nakato',
      children: [
        { name: 'Esther', ageBracket: '0-12' },
        { name: 'Daniel', ageBracket: '13-19', dateOfBirth: '2010-02-02' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing sex', () => {
    expect(profileCompletionInputSchema.safeParse({ maritalStatus: 'single' }).success).toBe(false);
  });

  it('rejects a missing maritalStatus', () => {
    expect(profileCompletionInputSchema.safeParse({ sex: 'male' }).success).toBe(false);
  });

  it('rejects an invalid sex', () => {
    expect(
      profileCompletionInputSchema.safeParse({ ...minimal, sex: 'other' }).success,
    ).toBe(false);
  });

  it('rejects an invalid maritalStatus', () => {
    expect(
      profileCompletionInputSchema.safeParse({ ...minimal, maritalStatus: 'engaged' }).success,
    ).toBe(false);
  });

  it('rejects a malformed child in the children array', () => {
    const result = profileCompletionInputSchema.safeParse({
      ...minimal,
      children: [{ name: 'Esther' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('profileUpdateInputSchema', () => {
  it('accepts an empty patch (no-op edit)', () => {
    expect(profileUpdateInputSchema.safeParse({}).success).toBe(true);
  });

  it('accepts the member-editable fields', () => {
    const result = profileUpdateInputSchema.safeParse({
      firstName: 'Grace',
      lastName: 'Nakato',
      profilePictureUrl: 'https://example.com/avatar.png',
      phone: '+256700111222',
      profession: 'Architect',
      dateOfBirth: '1998-04-23',
      clanId: 'clan_judah',
    });
    expect(result.success).toBe(true);
  });

  it('strips an attempt to edit sex (sex is admin-only)', () => {
    const result = profileUpdateInputSchema.safeParse({ phone: '+256700111222', sex: 'male' });
    expect(result.success).toBe(true);
    if (result.success) expect('sex' in result.data).toBe(false);
  });

  it('rejects a non-URL profilePictureUrl', () => {
    expect(profileUpdateInputSchema.safeParse({ profilePictureUrl: 'not-a-url' }).success).toBe(
      false,
    );
  });

  it('rejects a non-ISO dateOfBirth', () => {
    expect(profileUpdateInputSchema.safeParse({ dateOfBirth: '23-04-1998' }).success).toBe(false);
  });
});
