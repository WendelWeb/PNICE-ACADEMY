/**
 * Manual verification of Stripe's `Stripe-Signature` header (t/v1 scheme) —
 * no SDK, same approach as the Svix check in app/api/webhooks/clerk/route.ts.
 * https://docs.stripe.com/webhooks#verify-manually
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): boolean {
  if (!sigHeader || !secret) return false;
  const parts = sigHeader.split(',').map((p) => p.trim());
  const t = parts.find((p) => p.startsWith('t='))?.slice(2);
  const v1s = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || v1s.length === 0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const expBuf = Buffer.from(expected, 'utf8');
  return v1s.some((v) => {
    const buf = Buffer.from(v, 'utf8');
    return buf.length === expBuf.length && timingSafeEqual(buf, expBuf);
  });
}
