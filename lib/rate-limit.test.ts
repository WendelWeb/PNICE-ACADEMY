/**
 * Unit tests for lib/rate-limit.ts (Stage 8 — launch hygiene). Mirrors
 * lib/site/contact-rate-limit.test.ts's coverage of the pure sliding-window
 * core, plus the bucket-isolation guarantee `rateLimit()` adds on top.
 */
import { describe, it, expect } from 'vitest';
import { allowHit, rateLimit, ipFromHeaders, RATE_LIMITS } from './rate-limit';

const WINDOW = { max: 3, windowMs: 10_000 };

describe('allowHit — pure sliding window', () => {
  it('allows up to max hits inside the window, then refuses', () => {
    const hits = new Map<string, number[]>();
    expect(allowHit(hits, 'ip-1', 0, WINDOW)).toBe(true);
    expect(allowHit(hits, 'ip-1', 1_000, WINDOW)).toBe(true);
    expect(allowHit(hits, 'ip-1', 2_000, WINDOW)).toBe(true);
    expect(allowHit(hits, 'ip-1', 3_000, WINDOW)).toBe(false);
  });

  it('hits expire once the window has passed', () => {
    const hits = new Map<string, number[]>();
    allowHit(hits, 'ip-1', 0, WINDOW);
    allowHit(hits, 'ip-1', 0, WINDOW);
    allowHit(hits, 'ip-1', 0, WINDOW);
    expect(allowHit(hits, 'ip-1', 1_000, WINDOW)).toBe(false);
    expect(allowHit(hits, 'ip-1', WINDOW.windowMs, WINDOW)).toBe(true);
  });
});

describe('rateLimit — bucket+ip keyed shared window', () => {
  it('applies the window per bucket+ip key', () => {
    const ip = `test-ip-${Date.now()}`;
    const window = { max: 2, windowMs: 10_000 };
    const now = Date.now();
    expect(rateLimit('bucket-a', ip, window, now)).toBe(true);
    expect(rateLimit('bucket-a', ip, window, now)).toBe(true);
    expect(rateLimit('bucket-a', ip, window, now)).toBe(false);
  });

  it('two buckets for the SAME ip never share a quota', () => {
    const ip = `test-ip-shared-${Date.now()}`;
    const window = { max: 1, windowMs: 10_000 };
    const now = Date.now();
    expect(rateLimit('bucket-b1', ip, window, now)).toBe(true);
    expect(rateLimit('bucket-b1', ip, window, now)).toBe(false);
    // A different bucket, same ip, same instant — untouched quota.
    expect(rateLimit('bucket-b2', ip, window, now)).toBe(true);
  });

  it('two different ips in the same bucket never block each other', () => {
    const window = { max: 1, windowMs: 10_000 };
    const now = Date.now();
    const ipA = `test-ip-a-${now}`;
    const ipB = `test-ip-b-${now}`;
    expect(rateLimit('bucket-c', ipA, window, now)).toBe(true);
    expect(rateLimit('bucket-c', ipA, window, now)).toBe(false);
    expect(rateLimit('bucket-c', ipB, window, now)).toBe(true);
  });
});

describe('ipFromHeaders', () => {
  it('reads the first hop of x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18, 150.172.238.178' });
    expect(ipFromHeaders(h)).toBe('203.0.113.9');
  });

  it('trims whitespace around the first hop', () => {
    const h = new Headers({ 'x-forwarded-for': '  203.0.113.9  , 70.41.3.18' });
    expect(ipFromHeaders(h)).toBe('203.0.113.9');
  });

  it('falls back to "unknown" when the header is absent', () => {
    expect(ipFromHeaders(new Headers())).toBe('unknown');
  });
});

describe('RATE_LIMITS', () => {
  it('defines positive windows for checkout and upload', () => {
    expect(RATE_LIMITS.checkout.max).toBeGreaterThan(0);
    expect(RATE_LIMITS.checkout.windowMs).toBeGreaterThan(0);
    expect(RATE_LIMITS.upload.max).toBeGreaterThan(0);
    expect(RATE_LIMITS.upload.windowMs).toBeGreaterThan(0);
  });
});
