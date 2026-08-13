/**
 * lib/payments/moncash/direct.ts — MonCash straight from Digicel.
 *
 * The contract here was read out of `digicel-moncash-api-sdk@1.1.4`'s source
 * and Digicel's own "Rest API MonCash" PDF, then verified against their live
 * sandbox — not recalled from memory.
 *
 * WHY NO SDK: that package is a callback-era wrapper around node:http which
 * hardcodes `http://` for the payment redirect and carries its own token
 * cache. This app talks to Stripe through plain `fetch` for the same reasons
 * (no dependency, no surprises, full control of timeouts and error shapes).
 *
 * TRADE-OFF vs the Bazik provider: no middleman and no aggregator fee, but it
 * requires a Digicel merchant contract, and the return/notification URLs are
 * fixed once in Digicel's portal rather than passed per request — which is why
 * `createOrder` ignores `successUrl`/`errorUrl`/`webhookUrl`.
 *
 * SECURITY: the client id/secret are read from `process.env` at call time,
 * used only to mint a short-lived bearer server-side, and never returned,
 * logged, or sent to the browser. The browser only receives the
 * `Payment/Redirect?token=…` URL — a single-payment, Digicel-issued token.
 */
import type {
  MoncashCreateInput,
  MoncashFailure,
  MoncashMode,
  MoncashOrder,
  MoncashPayment,
  MoncashProvider,
} from './types';

const SANDBOX_HOST = 'sandbox.moncashbutton.digicelgroup.com';
const LIVE_HOST = 'moncashbutton.digicelgroup.com';

const OAUTH_PATH = '/Api/oauth/token';
const CREATE_PAYMENT_PATH = '/Api/v1/CreatePayment';
const RETRIEVE_ORDER_PATH = '/Api/v1/RetrieveOrderPayment';
/** The buyer-facing gateway sits under a different prefix than the API. */
const GATEWAY_PREFIX = '/Moncash-middleware';
const REDIRECT_PATH = '/Payment/Redirect';

const TIMEOUT_MS = 20_000;
/**
 * Digicel's tokens live 59 SECONDS (verified live, and stated in their docs).
 * A conventional "refresh a minute early" window would expire every token the
 * instant it was minted and re-authenticate on every call — so the margin is
 * 10s, leaving ~49s of real reuse while never handing a token to a call that
 * could outlive it.
 */
const TOKEN_SAFETY_WINDOW_S = 10;

export function directConfigured(): boolean {
  return Boolean(process.env.MONCASH_CLIENT_ID?.trim() && process.env.MONCASH_CLIENT_SECRET?.trim());
}

/**
 * Defaults to 'sandbox'. Going live must be deliberate (`MONCASH_MODE=live`):
 * guessing wrong in this direction costs a test payment, in the other it
 * charges a real customer against a sandbox wallet.
 */
export function directMode(): MoncashMode {
  return process.env.MONCASH_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'sandbox';
}

export function directHost(mode: MoncashMode = directMode()): string {
  return mode === 'live' ? LIVE_HOST : SANDBOX_HOST;
}

/**
 * Pure — the URL the BROWSER is sent to. Exported for tests: pointing a paying
 * customer at the wrong environment is a mistake no type checker would catch.
 * Always https (the SDK emits http://).
 */
export function directRedirectUrl(token: string, mode: MoncashMode = directMode()): string {
  return `https://${directHost(mode)}${GATEWAY_PREFIX}${REDIRECT_PATH}?token=${encodeURIComponent(token)}`;
}

/** Pure: the Basic credential Digicel's OAuth endpoint expects. */
export function directBasicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

/* --------------------------------- token --------------------------------- */

type CachedToken = { accessToken: string; expiresAtMs: number; key: string };
let cachedToken: CachedToken | null = null;

/** Test seam: drop the cached bearer. Harmless in production. */
export function resetDirectTokenCache(): void {
  cachedToken = null;
}

async function getToken(): Promise<{ ok: true; token: string } | MoncashFailure> {
  const clientId = process.env.MONCASH_CLIENT_ID?.trim();
  const clientSecret = process.env.MONCASH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return { ok: false, message: 'not_configured' };

  // Key includes mode + client id so rotating a key or flipping to live can
  // never serve a token minted for the other environment.
  const key = `${directMode()}:${clientId}`;
  if (cachedToken && cachedToken.key === key && Date.now() < cachedToken.expiresAtMs) {
    return { ok: true, token: cachedToken.accessToken };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://${directHost()}${OAUTH_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: directBasicAuth(clientId, clientSecret),
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: 'scope=read,write&grant_type=client_credentials',
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, message: `oauth HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}` };
    }
    const data = (await res.json().catch(() => null)) as
      | { access_token?: string; expires_in?: number }
      | null;
    const accessToken = data?.access_token;
    if (!accessToken) return { ok: false, message: 'oauth_no_token' };

    const ttl = Math.max(0, Number(data?.expires_in ?? 0) - TOKEN_SAFETY_WINDOW_S);
    cachedToken = { accessToken, expiresAtMs: Date.now() + ttl * 1000, key };
    return { ok: true, token: accessToken };
  } catch (e) {
    const message = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : 'error';
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

async function post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | MoncashFailure> {
  const auth = await getToken();
  if (!auth.ok) return auth;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://${directHost()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Our cached bearer was rejected (they expire in under a minute) — drop
      // it so the next call re-mints instead of looping on a dead token.
      if (res.status === 401) cachedToken = null;
      return { ok: false, message: `HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}` };
    }
    const data = (await res.json().catch(() => null)) as T | null;
    if (!data) return { ok: false, message: 'bad_json' };
    return { ok: true, data };
  } catch (e) {
    const message = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : 'error';
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- retrieval ------------------------------- */

type RetrieveResponse = {
  payment?: {
    reference?: string;
    transaction_id?: string;
    cost?: number;
    message?: string;
    payer?: string;
  };
};

/**
 * Pure — the ONE place Digicel's success word lives. Their retrieval reports
 * `payment.message === 'successful'` (their spelling). "Did we get paid" is
 * the most consequential boolean in this app, so it is exported and directly
 * unit-tested rather than inlined into a route.
 */
export function isDirectPaid(body: unknown): boolean {
  const payment = (body as RetrieveResponse | null)?.payment;
  if (!payment) return false;
  return String(payment.message ?? '').trim().toLowerCase() === 'successful';
}

/* ------------------------------- provider -------------------------------- */

export const directProvider: MoncashProvider = {
  id: 'direct',
  configured: directConfigured,
  mode: directMode,
  label: () => `Digicel — ${directHost()}`,

  async createOrder(input: MoncashCreateInput): Promise<MoncashOrder | MoncashFailure> {
    if (!directConfigured()) return { ok: false, message: 'not_configured' };
    if (!input.orderId.trim()) return { ok: false, message: 'bad_order_id' };
    if (!Number.isInteger(input.amountHtg) || input.amountHtg <= 0) {
      return { ok: false, message: 'bad_amount' };
    }
    // successUrl / errorUrl / webhookUrl are deliberately unused: Digicel takes
    // those once, in the merchant portal, not per request.

    const r = await post<{ payment_token?: { token?: string } }>(CREATE_PAYMENT_PATH, {
      amount: input.amountHtg,
      orderId: input.orderId,
    });
    if (!r.ok) return r;

    const token = r.data.payment_token?.token;
    if (!token) return { ok: false, message: 'no_payment_token' };

    const mode = directMode();
    return {
      ok: true,
      redirectUrl: directRedirectUrl(token, mode),
      // Digicel looks a payment up by the orderId WE chose, so our own
      // reference is what has to be persisted for the check later.
      providerRef: input.orderId,
      mode,
      provider: 'direct',
    };
  },

  async checkOrder(providerRef: string): Promise<MoncashPayment | MoncashFailure> {
    if (!directConfigured()) return { ok: false, message: 'not_configured' };
    if (!providerRef.trim()) return { ok: false, message: 'bad_order_id' };

    const r = await post<RetrieveResponse>(RETRIEVE_ORDER_PATH, { orderId: providerRef });
    if (!r.ok) return r;

    const p = r.data.payment ?? {};
    return {
      ok: true,
      paid: isDirectPaid(r.data),
      transactionId: p.transaction_id ?? null,
      amountHtg: typeof p.cost === 'number' ? p.cost : null,
      payer: p.payer ?? null,
      raw: r.data,
    };
  },
};
