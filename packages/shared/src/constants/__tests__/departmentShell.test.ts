import { describe, expect, it } from 'vitest';
import {
  CLAIM_DECLINE_REASON_MAX_LENGTH,
  DEPARTMENT_DESCRIPTION_MAX_LENGTH,
  HOD_NOTICE_MAX_LENGTH,
} from '../departmentShell';

describe('department shell caps (spec 0012, AC-8, AC-17, AC-31)', () => {
  // Pinned rather than merely "a number", because the form's character counter
  // and the mutation's rejection have to show and enforce the same limit.
  it('are the numbers the spec fixed', () => {
    expect(DEPARTMENT_DESCRIPTION_MAX_LENGTH).toBe(280);
    expect(CLAIM_DECLINE_REASON_MAX_LENGTH).toBe(280);
    expect(HOD_NOTICE_MAX_LENGTH).toBe(1000);
  });

  // A notice has no reply path, so it needs room for a paragraph where a
  // decline reason needs a sentence. If these ever equalise, the reasoning in
  // departmentShell.ts has stopped being true.
  it('give a notice more room than a decline reason', () => {
    expect(HOD_NOTICE_MAX_LENGTH).toBeGreaterThan(CLAIM_DECLINE_REASON_MAX_LENGTH);
  });
});
