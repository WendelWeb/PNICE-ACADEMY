/**
 * lib/payments/natcash/kobara.ts — NatCash, reached through Kobara.
 *
 * Kobara (api.kobara.app) is a Haitian payment gateway that fronts BOTH
 * MonCash and NatCash. This platform uses it for NatCash only: MonCash is
 * already live through Bazik and taking real money, and moving a working
 * money rail onto a second aggregator to save a dependency is a trade nobody
 * asked for. If Kobara ever needs to serve MonCash too, it slots in beside
 * `direct` and `bazik` — the provider contract is shared (lib/payments/
 * gateway.ts) precisely so that is a small change.
 *
 * HOW A PAYMENT GOES:
 *   1. POST /api/v1/payments with `provider: "natcash"` → a `checkout_url`.
 *   2. The buyer confirms in NatCash and is returned to `success_url`.
 *   3. Kobara POSTs a SIGNED `payment.succeeded` webhook to `webhook_url`.
 *
 * WHERE THIS RAIL DIFFERS FROM MONCASH, AND WHY IT MATTERS: Digicel and Bazik
 * both expose "tell me about this order" endpoints, so the MonCash rail's rule
 * is "never trust a callback, ask the provider". Kobara documents no such
 * endpoint. Its webhook is HMAC-SHA256-signed with a shared secret, which is
 * real cryptographic proof — the same class of evidence Stripe's webhook
 * signature provides, and what app/api/webhooks/natcash/route.ts verifies.
 * `checkOrder` below still TRIES a retrieve endpoint, because one probably
 * exists undocumented, and is careful to answer "I could not find out" rather
 * than "not paid" when it doesn't: a false "unpaid" on a real payment is the
 * one answer that costs a buyer their money.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  GatewayCreateInput,
  GatewayFailure,
  GatewayMode,
  GatewayOrder,
  GatewayPayment,
} from '../gateway';

const DEFAULT_BASE = 'https://api.kobara.app';
const TIMEOUT_MS = 15_000;

/** Server-side secret key (`kbr_sk_live_…` / `kbr_sk_test_…`). NEVER public. */
function secretKey(): string | undefined {
  return process.env.KOBARA_SECRET_KEY?.trim() || undefined;
}

export function kobaraWebhookSecret(): string | undefined {
  return process.env.KOBARA_WEBHOOK_SECRET?.trim() || undefined;
}

function apiBase(): string {
  return (process.env.KOBARA_API_BASE?.trim() || DEFAULT_BASE).replace(/\/+$/, '');
}

export function kobaraConfigured(): boolean {
  return Boolean(secretKey());
}

/**
 * Which environment the current key points at, read off the key itself.
 *
 * DEFAULTS TO 'live' when the prefix is unfamiliar — the same deliberate
 * inversion as the Bazik provider. Everything downstream uses this to decide
 * whether to warn the buyer "test mode, no real gourdes will move". Guessing
 * 'sandbox' about a key that turns out to be live would print that reassurance
 * over a real debit; guessing 'live' about a test key only shows a warning
 * that wasn't needed. Only one of those two mistakes takes someone's money.
 */
export function kobaraMode(): GatewayMode {
  const explicit = process.env.KOBARA_MODE?.trim().toLowerCase();
  if (explicit === 'sandbox') return 'sandbox';
  if (explicit === 'live') return 'live';
  return secretKey()?.includes('_test_') ? 'sandbox' : 'live';
}

export function kobaraLabel(): string {
  return `Kobara (${kobaraMode()}) — NatCash`;
}

async function kobaraFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string },
): Promise<{ ok: true; status: number; body: unknown } | GatewayFailure> {
  const key = secretKey();
  if (!key) return { ok: false, message: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Kobara recommends this to make a retried create idempotent — which
        // is exactly the protection a buyer who double-taps "Pay" needs.
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      // 429/5xx are worth retrying, 4xx are answers — the caller's
      // `isTransient` check keys off exactly this shape.
      const detail =
        (body as { message?: string; error?: { message?: string } } | null)?.message ??
        (body as { error?: { message?: string } } | null)?.error?.message ??
        '';
      return { ok: false, message: `HTTP ${res.status}${detail ? ` ${detail}` : ''}` };
    }
    return { ok: true, status: res.status, body };
  } catch (e) {
    const message = e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

/** Kobara's create-payment response, as documented. */
type KobaraPayment = {
  id?: string;
  kobara_reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  provider?: string;
  checkout_url?: string;
  paid_at?: string | null;
  MonCash_transaction_id?: string | null;
  transaction_id?: string | null;
  metadata?: Record<string, unknown>;
};

/** Kobara may wrap its payload in `data` — accept both, as the Bazik client
 *  had to. Docs and live responses disagree about this often enough that
 *  assuming one shape is how an integration breaks in production. */
function unwrap(body: unknown): KobaraPayment {
  const b = body as { data?: KobaraPayment } & KobaraPayment;
  return (b?.data ?? b ?? {}) as KobaraPayment;
}

export async function createKobaraOrder(
  input: GatewayCreateInput,
): Promise<GatewayOrder | GatewayFailure> {
  const res = await kobaraFetch('/api/v1/payments', {
    method: 'POST',
    idempotencyKey: input.orderId,
    body: JSON.stringify({
      amount: Math.round(input.amountHtg),
      currency: 'HTG',
      // Explicitly NatCash, not Kobara's unified checkout: this rail is
      // presented to the buyer as "NatCash" and must not silently land them
      // on a MonCash page they didn't choose.
      provider: 'natcash',
      description: input.description ?? 'PNICE Academy',
      // OUR order id travels in metadata so a webhook can be tied back to the
      // checkout row even if Kobara's own reference is all it echoes.
      metadata: { order_id: input.orderId },
      success_url: input.successUrl,
      error_url: input.errorUrl,
      webhook_url: input.webhookUrl,
    }),
  });
  if (!res.ok) return res;

  const p = unwrap(res.body);
  const checkoutUrl = p.checkout_url;
  const providerRef = p.id ?? p.kobara_reference;
  if (!checkoutUrl || !providerRef) {
    return { ok: false, message: 'malformed_create_response' };
  }
  return {
    ok: true,
    // Never hand a buyer an http:// redirect for a payment page.
    redirectUrl: checkoutUrl.replace(/^http:\/\//i, 'https://'),
    providerRef,
    mode: kobaraMode(),
  };
}

/**
 * Asks Kobara about an order.
 *
 * NO RETRIEVE ENDPOINT IS DOCUMENTED. This tries the conventional REST path
 * anyway — gateways almost always have one — and treats "that route doesn't
 * exist" (404/405/501) as `unsupported_by_provider`, NOT as "not paid".
 *
 * That distinction is the whole point. Callers use `paid: false` to mean "the
 * buyer did not pay", which sends them back to checkout and invites a second
 * charge. Reporting that because an endpoint is missing would take money from
 * someone who already paid. On this rail the authority is the signed webhook.
 */
export async function checkKobaraOrder(providerRef: string): Promise<GatewayPayment | GatewayFailure> {
  const res = await kobaraFetch(`/api/v1/payments/${encodeURIComponent(providerRef)}`, { method: 'GET' });
  if (!res.ok) {
    if (/^HTTP (404|405|501)/.test(res.message)) {
      return { ok: false, message: 'unsupported_by_provider' };
    }
    return res;
  }
  const p = unwrap(res.body);
  return {
    ok: true,
    paid: isKobaraPaid(p.status),
    transactionId: p.transaction_id ?? p.MonCash_transaction_id ?? p.kobara_reference ?? null,
    amountHtg: typeof p.amount === 'number' && p.amount > 0 ? Math.round(p.amount) : null,
    payer: null,
    raw: res.body,
  };
}

/** Pure — only an explicit success counts. 'pending' is not a maybe-yes. */
export function isKobaraPaid(status: unknown): boolean {
  return typeof status === 'string' && ['succeeded', 'success', 'completed', 'paid'].includes(status.trim().toLowerCase());
}

/* ----------------------------- webhook proof ------------------------------ */

/** How stale a signed webhook may be before we refuse it (replay protection). */
const MAX_SIGNATURE_AGE_S = 5 * 60;

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verifies a `Kobara-Signature: t=<unix>,v1=<hex>` header against the RAW
 * request body. Pure and exported so it can be tested without a live gateway.
 *
 * TWO PAYLOAD FORMS ARE ACCEPTED, deliberately. Kobara's docs show the HMAC
 * computed over `JSON.stringify(payload)` — i.e. a RE-serialised object —
 * while the Stripe-style convention this header format comes from signs
 * `"<t>.<raw body>"`. Re-serialising is unreliable (key order and whitespace
 * are not guaranteed to survive a round trip), so this checks the raw body
 * both ways and accepts either. Both are keyed HMACs over the exact bytes we
 * received; accepting two encodings of the same proof costs no security,
 * whereas guessing the wrong one rejects every genuine payment notification.
 *
 * Returns false for a missing secret: an unverifiable webhook is not a
 * trusted one, and this rail grants access on that trust alone.
 */
export function verifyKobaraSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowMs: number,
): boolean {
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header
      .split(',')
      .map((kv) => kv.split('='))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()]),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!v1) return false;

  // A timestamp is required when present-and-parsable; a replayed old
  // notification must not be able to re-grant access.
  if (Number.isFinite(t) && Math.abs(nowMs / 1000 - t) > MAX_SIGNATURE_AGE_S) return false;

  const hmac = (payload: string) => createHmac('sha256', secret).update(payload).digest('hex');
  return safeEqualHex(hmac(rawBody), v1) || safeEqualHex(hmac(`${parts.t}.${rawBody}`), v1);
}

/** Shape of the `payment.succeeded` event body Kobara delivers. */
export type KobaraEvent = {
  id?: string;
  type?: string;
  data?: { payment?: KobaraPayment };
};

/** Pure — the useful bits of a verified event, or null if it isn't one. */
export function readKobaraEvent(body: unknown): {
  eventType: string;
  paymentId: string | null;
  orderId: string | null;
  paid: boolean;
  amountHtg: number | null;
  transactionId: string | null;
} | null {
  const evt = body as KobaraEvent | null;
  if (!evt || typeof evt !== 'object') return null;
  const payment = evt.data?.payment;
  if (!payment) return null;
  const orderId = typeof payment.metadata?.order_id === 'string' ? payment.metadata.order_id : null;
  return {
    eventType: typeof evt.type === 'string' ? evt.type : 'unknown',
    paymentId: payment.id ?? payment.kobara_reference ?? null,
    orderId,
    paid: isKobaraPaid(payment.status),
    amountHtg: typeof payment.amount === 'number' && payment.amount > 0 ? Math.round(payment.amount) : null,
    transactionId: payment.transaction_id ?? payment.kobara_reference ?? null,
  };
}
