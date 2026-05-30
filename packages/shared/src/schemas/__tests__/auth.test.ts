import { describe, it, expect } from 'vitest';
import { signUpInputSchema, signInInputSchema } from '../auth';

// Unit tests for the shared auth validators (the single source of truth both
// the web admin and the mobile app import). DATA_MODEL.md, Increment 1:
// sign-up is first name + last name + email + password (min 8); sign-in is
// email + password (non-empty).

const validSignUp = {
  firstName: 'Grace',
  lastName: 'Nakato',
  email: 'visitor@example.com',
  password: 'password123',
};

describe('signUpInputSchema', () => {
  it('accepts valid first/last name + email + password', () => {
    const result = signUpInputSchema.safeParse(validSignUp);
    expect(result.success).toBe(true);
  });

  it('accepts a password of exactly 8 characters (boundary)', () => {
    const result = signUpInputSchema.safeParse({ ...validSignUp, password: '12345678' });
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace from names', () => {
    const result = signUpInputSchema.safeParse({
      ...validSignUp,
      firstName: '  Grace  ',
      lastName: '  Nakato  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('Grace');
      expect(result.data.lastName).toBe('Nakato');
    }
  });

  it('rejects an empty first name', () => {
    const result = signUpInputSchema.safeParse({ ...validSignUp, firstName: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.firstName).toBeDefined();
    }
  });

  it('rejects a whitespace-only last name', () => {
    const result = signUpInputSchema.safeParse({ ...validSignUp, lastName: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.lastName).toBeDefined();
    }
  });

  it('rejects an empty email', () => {
    const result = signUpInputSchema.safeParse({ ...validSignUp, email: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('rejects an invalid email format', () => {
    const result = signUpInputSchema.safeParse({ ...validSignUp, email: 'not-an-email' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('rejects an empty password', () => {
    const result = signUpInputSchema.safeParse({ ...validSignUp, password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toBeDefined();
    }
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = signUpInputSchema.safeParse({ ...validSignUp, password: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toBeDefined();
    }
  });
});

describe('signInInputSchema', () => {
  it('accepts a valid email + password', () => {
    const result = signInInputSchema.safeParse({
      email: 'visitor@example.com',
      password: 'anything',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty email', () => {
    const result = signInInputSchema.safeParse({ email: '', password: 'anything' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('rejects an invalid email format', () => {
    const result = signInInputSchema.safeParse({ email: 'not-an-email', password: 'anything' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('rejects an empty password', () => {
    const result = signInInputSchema.safeParse({ email: 'visitor@example.com', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toBeDefined();
    }
  });
});
