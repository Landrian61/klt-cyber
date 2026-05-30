import { describe, it, expect } from 'vitest';
import { roleAssignmentInputSchema, clanVerificationInputSchema } from '../roles';

// Unit tests for the role-assignment validators. DATA_MODEL.md, Increment 2:
// the input is discriminated on roleType so clan_elder requires a clanId while
// system_admin does not; clan verification is a verified/rejected verdict.

describe('roleAssignmentInputSchema', () => {
  it('accepts a system_admin assignment without a clanId', () => {
    const result = roleAssignmentInputSchema.safeParse({
      roleType: 'system_admin',
      userId: 'user_123',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a system_admin assignment with a note', () => {
    const result = roleAssignmentInputSchema.safeParse({
      roleType: 'system_admin',
      userId: 'user_123',
      note: 'Founding administrator',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a clan_elder assignment with a clanId', () => {
    const result = roleAssignmentInputSchema.safeParse({
      roleType: 'clan_elder',
      userId: 'user_123',
      clanId: 'clan_reuben',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a clan_elder assignment missing the clanId', () => {
    const result = roleAssignmentInputSchema.safeParse({
      roleType: 'clan_elder',
      userId: 'user_123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown roleType', () => {
    const result = roleAssignmentInputSchema.safeParse({
      roleType: 'tutor',
      userId: 'user_123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing userId', () => {
    const result = roleAssignmentInputSchema.safeParse({ roleType: 'system_admin' });
    expect(result.success).toBe(false);
  });

  it('ignores a stray clanId on a system_admin assignment', () => {
    // The system_admin variant has no clanId field, so a discriminated-union
    // parse strips it rather than carrying clan scope onto an unscoped role.
    const result = roleAssignmentInputSchema.safeParse({
      roleType: 'system_admin',
      userId: 'user_123',
      clanId: 'clan_reuben',
    });
    expect(result.success).toBe(true);
    if (result.success) expect('clanId' in result.data).toBe(false);
  });
});

describe('clanVerificationInputSchema', () => {
  it('accepts a verified verdict', () => {
    const result = clanVerificationInputSchema.safeParse({
      userId: 'user_123',
      status: 'verified',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a rejected verdict with a note', () => {
    const result = clanVerificationInputSchema.safeParse({
      userId: 'user_123',
      status: 'rejected',
      note: 'Not a recognised member of this clan',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a pending verdict (verification is a final verified/rejected call)', () => {
    const result = clanVerificationInputSchema.safeParse({
      userId: 'user_123',
      status: 'pending',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing userId', () => {
    expect(clanVerificationInputSchema.safeParse({ status: 'verified' }).success).toBe(false);
  });
});
