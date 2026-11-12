import { describe, expect, it } from 'vitest';
import {
  SUPPORT_CONTACT,
  buildSupportMessage,
  buildSupportWhatsAppUrl,
} from '../settings';
import { E164_PHONE_REGEX } from '../library';

// Spec 0023, AC-23, AC-24, AC-27.
describe('SUPPORT_CONTACT', () => {
  it('is empty or a valid E.164 number', () => {
    if (SUPPORT_CONTACT.whatsapp !== '') {
      expect(SUPPORT_CONTACT.whatsapp).toMatch(E164_PHONE_REGEX);
    }
  });
});

describe('buildSupportMessage', () => {
  it('names the version and platform', () => {
    expect(buildSupportMessage({ version: '1.4.0', platform: 'android' })).toBe(
      'Hi, I need help with the KLT app (v1.4.0, Android).'
    );
    expect(buildSupportMessage({ version: '1.4.0', platform: 'ios' })).toBe(
      'Hi, I need help with the KLT app (v1.4.0, iOS).'
    );
  });

  it('leaves the version out when it is unknown', () => {
    expect(buildSupportMessage({ version: undefined, platform: 'android' })).toBe(
      'Hi, I need help with the KLT app (Android).'
    );
    expect(buildSupportMessage({ version: null, platform: 'ios' })).toBe(
      'Hi, I need help with the KLT app (iOS).'
    );
  });

  it('drops the brackets when nothing is known', () => {
    expect(buildSupportMessage({ platform: 'web' })).toBe(
      'Hi, I need help with the KLT app.'
    );
  });
});

describe('buildSupportWhatsAppUrl', () => {
  it('returns null when no number is set', () => {
    expect(buildSupportWhatsAppUrl({ whatsapp: '' }, { platform: 'android' })).toBeNull();
  });

  it('strips the plus and encodes the message', () => {
    const url = buildSupportWhatsAppUrl(
      { whatsapp: '+256700123456' },
      { version: '1.4.0', platform: 'android' }
    );
    expect(url).toBe(
      'https://wa.me/256700123456?text=' +
        encodeURIComponent('Hi, I need help with the KLT app (v1.4.0, Android).')
    );
  });

  it('never carries personal details, only version and platform', () => {
    const url = buildSupportWhatsAppUrl(
      { whatsapp: '+256700123456' },
      { version: '2.0.0', platform: 'ios' }
    );
    const text = decodeURIComponent(url!.split('text=')[1]);
    expect(text).toBe('Hi, I need help with the KLT app (v2.0.0, iOS).');
  });
});
