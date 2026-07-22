import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature } from '@/lib/payments/stripe-verify';

const SECRET = 'whsec_test_secret';
const PAYLOAD = '{"id":"evt_1","type":"checkout.session.completed"}';

function sign(payload: string, secret: string, t: number): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('verifyStripeSignature', () => {
  const now = 1_700_000_000;

  it('accepts a valid signature within tolerance', () => {
    expect(verifyStripeSignature(PAYLOAD, sign(PAYLOAD, SECRET, now - 10), SECRET, now)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyStripeSignature(PAYLOAD, sign(PAYLOAD, 'whsec_other', now), SECRET, now)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    expect(verifyStripeSignature(PAYLOAD + 'x', sign(PAYLOAD, SECRET, now), SECRET, now)).toBe(false);
  });

  it('rejects a stale timestamp (replay protection)', () => {
    expect(verifyStripeSignature(PAYLOAD, sign(PAYLOAD, SECRET, now - 3600), SECRET, now)).toBe(false);
  });

  it('rejects null/malformed headers and empty secret', () => {
    expect(verifyStripeSignature(PAYLOAD, null, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(PAYLOAD, 'garbage', SECRET, now)).toBe(false);
    expect(verifyStripeSignature(PAYLOAD, sign(PAYLOAD, SECRET, now), '', now)).toBe(false);
  });

  it('accepts when one of several v1 entries matches', () => {
    const good = sign(PAYLOAD, SECRET, now);
    const withExtra = `${good},v1=${'0'.repeat(64)}`;
    expect(verifyStripeSignature(PAYLOAD, withExtra, SECRET, now)).toBe(true);
  });
});
