import { describe, it, expect } from 'vitest';
import { approvalStateShape, childInputSchema } from '../profile';

// Unit tests for the profile validators. DATA_MODEL.md, Increment 4:
// children carry a required `sex` and an optional numeric `dateOfBirth`
// (unix ms); `ageBracket`/`guardianContact` were dropped from Increment 2.

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
  const validChild = { name: 'Esther', sex: 'female' as const };

  it('accepts name + sex only', () => {
    expect(childInputSchema.safeParse(validChild).success).toBe(true);
  });

  it('accepts an optional numeric dateOfBirth', () => {
    const result = childInputSchema.safeParse({
      ...validChild,
      dateOfBirth: 1433116800000,
    });
    expect(result.success).toBe(true);
  });

  it('trims the name', () => {
    const result = childInputSchema.safeParse({ ...validChild, name: '  Esther  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Esther');
  });

  it('rejects a missing sex', () => {
    expect(childInputSchema.safeParse({ name: 'Esther' }).success).toBe(false);
  });

  it('rejects an invalid sex', () => {
    expect(childInputSchema.safeParse({ ...validChild, sex: 'other' }).success).toBe(false);
  });

  it('rejects a non-numeric dateOfBirth', () => {
    const result = childInputSchema.safeParse({ ...validChild, dateOfBirth: '2015-06-01' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(childInputSchema.safeParse({ ...validChild, name: '' }).success).toBe(false);
  });
});
