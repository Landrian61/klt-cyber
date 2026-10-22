import { describe, expect, it } from 'vitest';
import {
  EMAIL_TEMPLATES,
  FORGOT_PASSWORD_PATH,
  PASSWORD_RESET_EXPIRY_SECONDS,
  RESET_PASSWORD_PATH,
  passwordResetExpiryLabel,
} from '../emails';

describe('EMAIL_TEMPLATES (the closed six, SRS F1-10, AC-14)', () => {
  // The point of this test: the SRS allows exactly six system emails. If a
  // later feature adds a seventh template name, or quietly drops one, this
  // fails and forces the SRS conversation instead of letting the rule erode.
  // It was five until spec 0008 added the public deletion link and amended
  // the SRS to match, which is the process working rather than failing.
  it('holds exactly six template names', () => {
    expect(EMAIL_TEMPLATES).toHaveLength(6);
  });

  it('holds exactly the six the SRS names, and nothing else', () => {
    expect([...EMAIL_TEMPLATES].sort()).toEqual([
      'account_deleted',
      'account_deletion_requested',
      'password_reset',
      'profile_sent_back',
      'profile_verified',
      'welcome',
    ]);
  });

  it('has no duplicate names, so the count cannot be padded', () => {
    expect(new Set(EMAIL_TEMPLATES).size).toBe(EMAIL_TEMPLATES.length);
  });
});

describe('password reset constants', () => {
  it('expires a reset link in 1 hour (AC-5)', () => {
    expect(PASSWORD_RESET_EXPIRY_SECONDS).toBe(3600);
  });

  // Guards the one thing this constant exists to prevent: copy drifting away
  // from the configured expiry, as the mobile mock's "30 minutes" once did.
  it('derives its human label from the configured expiry', () => {
    expect(passwordResetExpiryLabel()).toBe('1 hour');
  });

  it('exposes the portal paths the routes and clients share (AC-2, AC-10)', () => {
    expect(RESET_PASSWORD_PATH).toBe('/reset-password');
    expect(FORGOT_PASSWORD_PATH).toBe('/forgot-password');
  });
});
