import { describe, expect, it } from 'vitest';
import { addWalkInSchema } from '../hospitality';

const today = '2026-11-13';
const schema = addWalkInSchema(today);

describe('addWalkInSchema (AC-4 to AC-6)', () => {
  it('accepts the minimum: a first name and a visit date', () => {
    const result = schema.safeParse({ firstName: '  Grace ', visitDate: today });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('Grace');
      expect(result.data.consent).toBe(false);
      expect(result.data.phone).toBeUndefined();
    }
  });

  it('reads empty optional strings as not given', () => {
    const result = schema.safeParse({
      firstName: 'Grace',
      visitDate: today,
      lastName: '',
      phone: '  ',
      notes: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastName).toBeUndefined();
      expect(result.data.phone).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });

  it('refuses a missing first name', () => {
    expect(schema.safeParse({ firstName: '   ', visitDate: today }).success).toBe(false);
  });

  it('refuses a phone without consent (AC-6)', () => {
    const result = schema.safeParse({ firstName: 'Grace', visitDate: today, phone: '0772123456' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toEqual(['consent']);
  });

  it('accepts a phone with consent', () => {
    const result = schema.safeParse({
      firstName: 'Grace',
      visitDate: today,
      phone: '0772 123456',
      consent: true,
    });
    expect(result.success).toBe(true);
  });

  it('refuses an unparseable phone', () => {
    expect(
      schema.safeParse({ firstName: 'Grace', visitDate: today, phone: '12', consent: true }).success,
    ).toBe(false);
  });

  it('refuses a visit date in the future or too far back (AC-5)', () => {
    expect(schema.safeParse({ firstName: 'Grace', visitDate: '2026-11-14' }).success).toBe(false);
    expect(schema.safeParse({ firstName: 'Grace', visitDate: '2026-10-13' }).success).toBe(false);
    expect(schema.safeParse({ firstName: 'Grace', visitDate: '2026-10-14' }).success).toBe(true);
  });

  it('refuses unknown enum values', () => {
    expect(schema.safeParse({ firstName: 'Grace', visitDate: today, sex: 'other' }).success).toBe(false);
    expect(schema.safeParse({ firstName: 'Grace', visitDate: today, ageBracket: '20-35' }).success).toBe(true);
  });
});
