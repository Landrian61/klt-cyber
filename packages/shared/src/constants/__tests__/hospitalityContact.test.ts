import { describe, expect, it } from 'vitest';
import {
  IN_APP_MESSAGE_TITLE,
  fillHospitalityTemplate,
  followUpAssignedNotice,
  hospitalityContactLinks,
} from '../hospitality';
import { PORTAL_WORK_COPY, PORTAL_WORK_TYPES } from '../notifications';

// Spec 0024, milestone 3: the one tap links (AC-17) and the N36/N41 wording.

describe('hospitalityContactLinks (AC-17)', () => {
  it('builds tel, wa.me and sms links from the stored E.164 phone', () => {
    const links = hospitalityContactLinks('+256772123456', 'Hello Grace, thank you!');
    expect(links.call).toBe('tel:+256772123456');
    expect(links.whatsapp).toBe(
      'https://wa.me/256772123456?text=Hello%20Grace%2C%20thank%20you!',
    );
    expect(links.sms).toBe('sms:+256772123456?body=Hello%20Grace%2C%20thank%20you!');
  });

  it('carries a filled template intact through the encoding', () => {
    const message = fillHospitalityTemplate('first_visit_thanks', {
      firstName: 'Grace',
      visitDate: '2026-11-08',
    });
    const { whatsapp } = hospitalityContactLinks('+256772123456', message);
    const text = new URL(whatsapp).searchParams.get('text');
    expect(text).toBe(message);
    expect(text).toContain('8 November');
  });
});

describe('notices (N36, N41)', () => {
  it('names only the visitor first name in N36', () => {
    const notice = followUpAssignedNotice('Grace');
    expect(notice.body).toContain('Grace');
    expect(notice.title.length).toBeGreaterThan(0);
  });

  it('gives N36 a portal work screen on mobile', () => {
    expect(PORTAL_WORK_TYPES).toContain('hospitality_follow_up');
    expect(PORTAL_WORK_COPY.hospitality_follow_up.body).toMatch(/Follow ups/);
  });

  it('has an N41 title', () => {
    expect(IN_APP_MESSAGE_TITLE).toMatch(/Kingdom Life Tabernacle/);
  });
});
