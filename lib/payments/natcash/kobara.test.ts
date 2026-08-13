/**
 * The NatCash rail grants course access on the strength of a webhook
 * signature and nothing else — Kobara documents no endpoint to re-ask about a
 * payment. That makes `verifyKobaraSignature` the single lock on the door:
 * anyone who could get past it could POST themselves a paid course.
 *
 * `readKobaraEvent` and `isKobaraPaid` are pinned alongside it because the
 * expensive mistake on this rail is symmetrical — treating "I could not find
 * out" as "paid" hands out free courses; treating it as "not paid" sends a
 * buyer who was already debited back to pay a second time.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyKobaraSignature, readKobaraEvent, isKobaraPaid } from './kobara';

const SECRET = 'whsec_kobara_test';
const NOW = Date.parse('2026-08-13T12:00:00Z');
const T = Math.floor(NOW / 1000);

const BODY = JSON.stringify({
  id: 'evt_1',
  type: 'payment.succeeded',
  data: {
    payment: {
      id: 'pay_1',
      kobara_reference: 'KBR-PAY-1',
      amount: 270,
      currency: 'HTG',
      status: 'succeeded',
      provider: 'natcash',
      metadata: { order_id: 'order-1' },
    },
  },
});

const sign = (payload: string, secret = SECRET) =>
  createHmac('sha256', secret).update(payload).digest('hex');

describe('verifyKobaraSignature', () => {
  it('accepts a signature over the raw body (the docs’ own form)', () => {
    expect(verifyKobaraSignature(BODY, `t=${T},v1=${sign(BODY)}`, SECRET, NOW)).toBe(true);
  });

  it('also accepts the Stripe-style "<t>.<body>" payload', () => {
    // The header FORMAT comes from that convention, and gateways implement it
    // both ways. Accepting either costs nothing — both are keyed HMACs over
    // the exact bytes received — while guessing wrong rejects every genuine
    // payment notification on the rail.
    expect(verifyKobaraSignature(BODY, `t=${T},v1=${sign(`${T}.${BODY}`)}`, SECRET, NOW)).toBe(true);
  });

  it('refuses a body that was altered after signing', () => {
    const tampered = BODY.replace('"amount":270', '"amount":1');
    expect(tampered).not.toBe(BODY); // the edit really landed
    expect(verifyKobaraSignature(tampered, `t=${T},v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
  });

  it('refuses a signature made with a different secret', () => {
    expect(verifyKobaraSignature(BODY, `t=${T},v1=${sign(BODY, 'wrong')}`, SECRET, NOW)).toBe(false);
  });

  it('refuses a replayed notification more than five minutes old', () => {
    const old = T - 6 * 60;
    expect(verifyKobaraSignature(BODY, `t=${old},v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
  });

  it('accepts one that is merely a few minutes late', () => {
    const recent = T - 120;
    expect(verifyKobaraSignature(BODY, `t=${recent},v1=${sign(BODY)}`, SECRET, NOW)).toBe(true);
  });

  it.each([
    ['no header at all', null],
    ['a header with no v1', `t=${T}`],
    ['an empty header', ''],
    ['garbage', 'not-a-signature'],
  ])('refuses %s', (_label, header) => {
    expect(verifyKobaraSignature(BODY, header, SECRET, NOW)).toBe(false);
  });

  it('refuses everything when no secret is configured — unverifiable is not trusted', () => {
    expect(verifyKobaraSignature(BODY, `t=${T},v1=${sign(BODY)}`, undefined, NOW)).toBe(false);
  });
});

describe('readKobaraEvent', () => {
  it('extracts our own order id, the amount and the transaction reference', () => {
    expect(readKobaraEvent(JSON.parse(BODY))).toEqual({
      eventType: 'payment.succeeded',
      paymentId: 'pay_1',
      orderId: 'order-1',
      paid: true,
      amountHtg: 270,
      transactionId: 'KBR-PAY-1',
    });
  });

  it('reports paid=false for an event that is not a success', () => {
    const pending = JSON.parse(BODY);
    pending.data.payment.status = 'pending';
    expect(readKobaraEvent(pending)?.paid).toBe(false);
  });

  it('returns null for anything that is not a payment event', () => {
    expect(readKobaraEvent(null)).toBeNull();
    expect(readKobaraEvent({})).toBeNull();
    expect(readKobaraEvent({ type: 'ping', data: {} })).toBeNull();
  });

  it('reports a missing order id rather than inventing one', () => {
    const orphan = JSON.parse(BODY);
    delete orphan.data.payment.metadata;
    expect(readKobaraEvent(orphan)?.orderId).toBeNull();
  });
});

describe('isKobaraPaid', () => {
  it('accepts only an explicit success', () => {
    for (const s of ['succeeded', 'SUCCESS', ' completed ', 'paid']) {
      expect(isKobaraPaid(s)).toBe(true);
    }
  });

  it('treats anything else as not paid — "pending" is not a maybe-yes', () => {
    for (const s of ['pending', 'failed', 'canceled', '', 'unknown', null, undefined, 1]) {
      expect(isKobaraPaid(s)).toBe(false);
    }
  });
});
