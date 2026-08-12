/**
 * lib/payments/moncash.ts — server-only MonCash (Digicel) REST client.
 *
 * WHY NO SDK: `digicel-moncash-api-sdk` is a callback-era wrapper around
 * node:http that hardcodes `http://` for the payment redirect and carries its
 * own token cache. This app already talks to Stripe through plain `fetch` for
 * the same reasons (no dependency, no surprises, full control of timeouts and
 * error shapes), so MonCash follows that convention. The API contract below
 * was read straight out of that SDK's source (v1.1.4 — lib/configure.js,
 * lib/api.js, lib/resources/{Payment,Capture}.js) rather than from memory.
 *
 * WHAT MONCASH IS: a Haitian mobile wallet. Two consequences shape everything
 * here and must not be "fixed" later without re-reading this note:
 *   1. It charges in GOURDES (HTG), never USD. Prices in this app are stored
 *      in USD cents, so every charge converts through the live FX rate
 *      (lib/fx.ts) at order-creation time and the converted figure is what the
 *      buyer is committed to. The `payments` row records HTG so the receipt
 *      and the admin ledger tell the truth about what was actually charged.
 *   2. It has NO recurring/mandate concept — one-off payments only. Both
 *      subscription products (pass prof, Pass PNICE) therefore stay card-only;
 *      the checkout route refuses a MonCash subscription rather than creating
 *      an order nobody can renew.
 *
 * ENV-GATED + NEVER-THROW, same contract as lib/bunny/upload.ts: missing keys
 * resolve to `{ ok: false, message: 'not_configured' }`; every network/parse
 * failure resolves to `{ ok: false, message }`. Nothing here ever throws, so a
 * MonCash outage degrades the checkout page instead of 500-ing it.
 *
 * SECURITY: the client id/secret are read from `process.env` at call time,
 * used only to mint a short-lived bearer token server-side, and never returned,
 * logged, or embedded in anything the browser sees. The browser only ever
 * receives the `Payment/Redirect?token=…` URL, which is a single-payment,
 * MonCash-issued token — not a credential of ours.
 */

const SANDBOX_HOST = 'sandbox.moncashbutton.digicelgroup.com';
const LIVE_HOST = 'moncashbutton.digicelgroup.com';

const OAUTH_PATH = '/Api/oauth/token';
const CREATE_PAYMENT_PATH = '/Api/v1/CreatePayment';
const RETRIEVE_ORDER_PATH = '/Api/v1/RetrieveOrderPayment';
const RETRIEVE_TRANSACTION_PATH = '/Api/v1/RetrieveTransactionPayment';
/** The customer-facing gateway lives under a different path prefix than the API. */
const GATEWAY_PREFIX = '/Moncash-middleware';
const REDIRECT_PATH = '/Payment/Redirect';

const TIMEOUT_MS = 20_000;
/** Refresh a little before real expiry so an in-flight call can't age out. */
const TOKEN_SAFETY_WINDOW_S = 60;

export type MoncashMode = 'sandbox' | 'live';
export type MoncashFailure = { ok: false; message: string };

/** True once BOTH credentials are set. Mirrors `stripeConfigured()`/`bunnyUploadConfigured()`. */
export function moncashConfigured(): boolean {
  return Boolean(process.env.MONCASH_CLIENT_ID?.trim() && process.env.MONCASH_CLIENT_SECRET?.trim());
}

/**
 * Defaults to 'sandbox'. Going live is an explicit, deliberate act
 * (`MONCASH_MODE=live`) — the failure mode of guessing wrong in this direction
 * is a test payment, in the other it is charging a real customer against a
 * sandbox wallet.
 */
export function moncashMode(): MoncashMode {
  return process.env.MONCASH_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'sandbox';
}

export function moncashHost(mode: MoncashMode = moncashMode()): string {
  return mode === 'live' ? LIVE_HOST : SANDBOX_HOST;
}

/**
 * Pure — the URL the BROWSER is sent to in order to pay. Exported for tests:
 * getting this wrong sends a paying customer to the wrong environment, which
 * no type checker would catch. Always https (the SDK emits http://).
 */
export function moncashRedirectUrl(token: string, mode: MoncashMode = moncashMode()): string {
  return `https://${moncashHost(mode)}${GATEWAY_PREFIX}${REDIRECT_PATH}?token=${encodeURIComponent(token)}`;
}

/* --------------------------------- token --------------------------------- */

type CachedToken = { accessToken: string; expiresAtMs: number; key: string };
let cachedToken: CachedToken | null = null;

/** Pure: the Basic credential MonCash's OAuth endpoint expects. */
export function moncashBasicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function getToken(): Promise<{ ok: true; token: string } | MoncashFailure> {
  const clientId = process.env.MONCASH_CLIENT_ID?.trim();
  const clientSecret = process.env.MONCASH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return { ok: false, message: 'not_configured' };

  // Cache key includes the credentials + mode so rotating a key or flipping to
  // live can never serve a stale token minted for the other environment.
  const key = `${moncashMode()}:${clientId}`;
  if (cachedToken && cachedToken.key === key && Date.now() < cachedToken.expiresAtMs) {
    return { ok: true, token: cachedToken.accessToken };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://${moncashHost()}${OAUTH_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: moncashBasicAuth(clientId, clientSecret),
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

/** Test seam: drop the cached bearer (used by unit tests; harmless in prod). */
export function resetMoncashTokenCache(): void {
  cachedToken = null;
}

/* ------------------------------ authed call ------------------------------ */

async function post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | MoncashFailure> {
  const auth = await getToken();
  if (!auth.ok) return auth;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://${moncashHost()}${path}`, {
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
      // A 401 here means our cached token was rejected — drop it so the very
      // next call re-mints rather than looping on a dead bearer.
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

/* ------------------------------ create order ----------------------------- */

export type MoncashOrder = { ok: true; token: string; redirectUrl: string; mode: MoncashMode };

/**
 * Creates a MonCash payment for `orderId` and returns the URL to send the
 * buyer to. `amountHtg` is a WHOLE number of gourdes — MonCash has no cent
 * concept, and passing a fractional amount silently truncates on their side,
 * so the caller must have rounded already (see `usdCentsToHtg`).
 *
 * `orderId` is OUR reference (the checkout_sessions row id). It is what
 * `retrieveMoncashOrder` looks the payment back up by, and what makes
 * fulfilment idempotent — never reuse one across two carts.
 */
export async function createMoncashOrder(input: {
  orderId: string;
  amountHtg: number;
}): Promise<MoncashOrder | MoncashFailure> {
  if (!moncashConfigured()) return { ok: false, message: 'not_configured' };
  if (!Number.isInteger(input.amountHtg) || input.amountHtg <= 0) {
    return { ok: false, message: 'bad_amount' };
  }
  if (!input.orderId.trim()) return { ok: false, message: 'bad_order_id' };

  const r = await post<{ payment_token?: { token?: string } }>(CREATE_PAYMENT_PATH, {
    amount: input.amountHtg,
    orderId: input.orderId,
  });
  if (!r.ok) return r;

  const token = r.data.payment_token?.token;
  if (!token) return { ok: false, message: 'no_payment_token' };

  const mode = moncashMode();
  return { ok: true, token, redirectUrl: moncashRedirectUrl(token, mode), mode };
}

/* ------------------------------- verify ---------------------------------- */

/** The subset of MonCash's retrieval payload this app relies on. */
export type MoncashPayment = {
  ok: true;
  paid: boolean;
  orderId: string | null;
  transactionId: string | null;
  /** Gourdes actually charged, as MonCash reports them. */
  costHtg: number | null;
  payer: string | null;
  raw: unknown;
};

type RetrieveResponse = {
  payment?: {
    reference?: string;
    transaction_id?: string;
    cost?: number;
    message?: string;
    payer?: string;
  };
  status?: number;
};

/**
 * Pure — decides whether a retrieval payload represents money actually
 * received. MonCash signals success through `payment.message === 'successful'`
 * (their spelling), so this is the ONE place that string lives. Exported
 * because "did we get paid" is the single most consequential boolean in the
 * app and deserves a direct unit test rather than being buried in a route.
 */
export function isMoncashPaid(body: unknown): boolean {
  const payment = (body as RetrieveResponse | null)?.payment;
  if (!payment) return false;
  return String(payment.message ?? '').trim().toLowerCase() === 'successful';
}

function mapRetrieval(body: RetrieveResponse): MoncashPayment {
  const p = body.payment ?? {};
  return {
    ok: true,
    paid: isMoncashPaid(body),
    orderId: p.reference ?? null,
    transactionId: p.transaction_id ?? null,
    costHtg: typeof p.cost === 'number' ? p.cost : null,
    payer: p.payer ?? null,
    raw: body,
  };
}

/** Looks a payment up by OUR order reference. The authoritative "was it paid". */
export async function retrieveMoncashOrder(orderId: string): Promise<MoncashPayment | MoncashFailure> {
  if (!moncashConfigured()) return { ok: false, message: 'not_configured' };
  if (!orderId.trim()) return { ok: false, message: 'bad_order_id' };
  const r = await post<RetrieveResponse>(RETRIEVE_ORDER_PATH, { orderId });
  return r.ok ? mapRetrieval(r.data) : r;
}

/** Looks a payment up by MONCASH's own transaction id (used by the notification callback). */
export async function retrieveMoncashTransaction(
  transactionId: string,
): Promise<MoncashPayment | MoncashFailure> {
  if (!moncashConfigured()) return { ok: false, message: 'not_configured' };
  if (!transactionId.trim()) return { ok: false, message: 'bad_transaction_id' };
  const r = await post<RetrieveResponse>(RETRIEVE_TRANSACTION_PATH, { transactionId });
  return r.ok ? mapRetrieval(r.data) : r;
}

/* -------------------------------- money ---------------------------------- */

/**
 * Pure — USD cents to whole gourdes at `rate`. Rounds to the nearest gourde
 * because MonCash has no sub-unit: a half-gourde would be silently dropped by
 * their gateway, so the rounding is made explicit and testable here instead.
 * Always returns at least 1 gourde for any non-zero price — a course must
 * never become free through a rounding accident.
 */
export function usdCentsToHtg(amountCents: number, rate: number): number {
  if (!Number.isFinite(amountCents) || !Number.isFinite(rate) || amountCents <= 0 || rate <= 0) return 0;
  return Math.max(1, Math.round((amountCents / 100) * rate));
}
