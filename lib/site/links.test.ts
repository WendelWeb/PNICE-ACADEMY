import { describe, it, expect } from 'vitest';
import { whatsAppHref, safeSocialUrl } from './links';

describe('whatsAppHref — footer WhatsApp link only when a real number is set', () => {
  it('builds a wa.me link from a plain digit string', () => {
    expect(whatsAppHref('50937000000')).toBe('https://wa.me/50937000000');
  });

  it('strips the formats people actually paste (+, spaces, dashes, parens)', () => {
    expect(whatsAppHref('+509 37 00 00 00')).toBe('https://wa.me/50937000000');
    expect(whatsAppHref('(509) 3700-0000')).toBe('https://wa.me/50937000000');
  });

  it('hides the link when unset or not a phone number', () => {
    expect(whatsAppHref(undefined)).toBeNull();
    expect(whatsAppHref(null)).toBeNull();
    expect(whatsAppHref('')).toBeNull();
    expect(whatsAppHref('byento')).toBeNull();
    expect(whatsAppHref('123')).toBeNull(); // too short to be a real number
    expect(whatsAppHref('1234567890123456')).toBeNull(); // beyond E.164 max
  });
});

describe('safeSocialUrl — social icons only for real http(s) URLs', () => {
  it('accepts a normal https profile URL', () => {
    expect(safeSocialUrl('https://facebook.com/pniceacademy')).toBe(
      'https://facebook.com/pniceacademy',
    );
  });

  it('rejects unset, blank, non-URL, and non-http(s) values', () => {
    expect(safeSocialUrl(undefined)).toBeNull();
    expect(safeSocialUrl('')).toBeNull();
    expect(safeSocialUrl('   ')).toBeNull();
    expect(safeSocialUrl('pniceacademy')).toBeNull();
    // eslint-disable-next-line no-script-url
    expect(safeSocialUrl('javascript:alert(1)')).toBeNull();
  });
});
