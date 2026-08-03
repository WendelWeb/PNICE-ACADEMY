/**
 * Unit tests for lib/site/contact-rate-limit.ts (Stage 4) — the pure
 * sliding-window core behind the public /kontak form's action. The
 * per-instance limitation is documented in the module header; these tests
 * cover the pure mechanics: allow-up-to-max, refuse-at-max, expiry, and
 * per-key isolation.
 */
import { describe, it, expect } from 'vitest';
import { allowHit, allowContactSubmission, CONTACT_RATE } from './contact-rate-limit';

const WINDOW = { max: 3, windowMs: 10 * 60_000 };

describe('allowHit — pure sliding window', () => {
  it('allows up to max hits inside the window, then refuses', () => {
    const hits = new Map<string, number[]>();
    expect(allowHit(hits, 'ip-1', 0, WINDOW)).toBe(true);
    expect(allowHit(hits, 'ip-1', 1_000, WINDOW)).toBe(true);
    expect(allowHit(hits, 'ip-1', 2_000, WINDOW)).toBe(true);
    expect(allowHit(hits, 'ip-1', 3_000, WINDOW)).toBe(false);
  });

  it('a refused hit is NOT recorded (refusals never extend the lockout)', () => {
    const hits = new Map<string, number[]>();
    for (let i = 0; i < 5; i++) allowHit(hits, 'ip-1', i, WINDOW);
    expect(hits.get('ip-1')).toHaveLength(WINDOW.max);
  });

  it('hits expire once the window has passed', () => {
    const hits = new Map<string, number[]>();
    allowHit(hits, 'ip-1', 0, WINDOW);
    allowHit(hits, 'ip-1', 0, WINDOW);
    allowHit(hits, 'ip-1', 0, WINDOW);
    expect(allowHit(hits, 'ip-1', 1_000, WINDOW)).toBe(false);
    expect(allowHit(hits, 'ip-1', WINDOW.windowMs, WINDOW)).toBe(true);
  });

  it('keys are independent — one busy IP never blocks another', () => {
    const hits = new Map<string, number[]>();
    for (let i = 0; i < 5; i++) allowHit(hits, 'ip-1', i, WINDOW);
    expect(allowHit(hits, 'ip-2', 10, WINDOW)).toBe(true);
  });
});

describe('allowContactSubmission — the shared instance window', () => {
  it('applies CONTACT_RATE to its own shared map', () => {
    const key = `test-${Date.now()}`;
    const now = Date.now();
    for (let i = 0; i < CONTACT_RATE.max; i++) {
      expect(allowContactSubmission(key, now + i)).toBe(true);
    }
    expect(allowContactSubmission(key, now + CONTACT_RATE.max)).toBe(false);
    expect(allowContactSubmission(key, now + CONTACT_RATE.windowMs + 1)).toBe(true);
  });
});
