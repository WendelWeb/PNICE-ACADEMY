/**
 * lib/payments/moncash.ts — server-only client for MonCash's **Merchant API**
 * (Digicel Haiti).
 *
 * WHICH MONCASH API THIS IS, AND WHY IT MATTERS: Digicel ships two unrelated
 * payment products under the MonCash name.
 *
 *   - "Payment Button" (`/Api/v1/CreatePayment`) hands back a token, and the
 *     BUYER'S BROWSER IS REDIRECTED to a MonCash-hosted page to pay.
 *   - "Merchant API" (`/MerChantApi/V1/...`, this file) takes the buyer's own
 *     MonCash phone number, pushes a cash-out request to their handset, and
 *     they approve it there with their PIN. THE BUYER NEVER LEAVES THIS SITE.
 *
 * The second is what this platform uses, deliberately: every redirect away
 * from checkout costs buyers, and this audience is on phones where bouncing
 * between a browser and a wallet app is exactly where people give up.
 *
 * TWO CONSTRAINTS OF THIS API DRIVE THE DESIGN, both verified in Digicel's
 * own docs rather than assumed:
 *   1. The access token expires in **59 seconds**. A conventional
 *      "refresh a minute early" cache would therefore never serve a single
 *      cached token; the safety window below is sized for that reality.
 *   2. `POST /Payment` blocks, polling internally for up to 2 minutes. That
 *      is far longer than a serverless request should live, so this app uses
 *      `InitiatePayment` (returns at once, `message: "pending"`) and then
 *      polls `CheckPayment` itself from a short status endpoint.
 *
 * WHAT MONCASH IS: a Haitian mobile wallet, so two further rules hold:
 *   - It charges in GOURDES (HTG). Prices here are USD cents, so every charge
 *     converts at the live admin rate (lib/fx.ts) when the order is created.
 *   - It has NO recurring/mandate concept. Both subscription products stay
 *     card-only; the checkout route refuses a MonCash subscription outright
 *     rather than selling something that could never renew.
 *
 * ENV-GATED + NEVER-THROW, like lib/bunny/upload.ts: missing keys resolve to
 * `{ ok: false, message: 'not_configured' }`, and every network/parse failure
 * resolves to `{ ok: false, message }`. A MonCash outage degrades checkout
 * instead of 500-ing it.
 *
 * SECURITY: credentials are read from `process.env` at call time, used only to
 * mint a short-lived bearer server-side, and never returned, logged, or sent
 * to the browser. The browser never talks to MonCash at all in this flow.
 */

const SANDBOX_HOST = 'sandbox.moncashbutton.digicelgroup.com';
const LIVE_HOST = 'moncashbutton.digicelgroup.com';

/** Note the capital "C" — Digicel's own path, not a typo. */
const BASE = '/MerChantApi';
const OAUTH_PATH = `${BASE}/oauth/token`;
const INITIATE_PATH = `${BASE}/V1/InitiatePayment`;
const CHECK_PATH = `${BASE}/V1/CheckPayment`;

const TIMEOUT_MS = 20_000;
/**
 * Tokens live 59s. Refreshing 10s early leaves ~49s of reuse — enough to cover
 * an initiate + a couple of status polls on one token, while never handing a
 * token to a call that could outlive it.
 */
const TOKEN_SAFETY_WINDOW_S = 10;

export type MoncashMode = 'sandbox' | 'live';
export type MoncashFailure = { ok: false; message: string };

/** True once BOTH credentials are set. Mirrors `stripeConfigured()`. */
export function moncashConfigured(): boolean {
  return Boolean(process.env.MONCASH_CLIENT_ID?.trim() && process.env.MONCASH_CLIENT_SECRET?.trim());
}

/**
 * Defaults to 'sandbox'. Going live must be a deliberate act
 * (`MONCASH_MODE=live`): guessing wrong in this direction costs a test
 * payment, in the other it charges a real customer against a sandbox wallet.
 */
export function moncashMode(): MoncashMode {
  return process.env.MONCASH_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'sandbox';
}

export function moncashHost(mode: MoncashMode = moncashMode()): string {
  return mode === 'live' ? LIVE_HOST : SANDBOX_HOST;
}

/* ------------------------------ phone number ----------------------------- */

/**
 * Pure — normalises whatever a buyer types into the `account` MonCash expects:
 * a Haitian number in international form without a plus sign, e.g.
 * `50938662809`.
 *
 * Haitian mobiles are 8 digits (3/4 for Digicel, 2/e for Natcom) and people
 * write them every possible way: `38 66 28 09`, `+509 3866-2809`,
 * `0509...`. Getting this wrong means the cash-out request goes to nobody and
 * the buyer sits waiting for a prompt that never arrives — so it is a pure,
 * directly-tested function rather than a regex buried in a route.
 * Returns null when the input cannot be a Haitian mobile.
 */
export function normalizeHaitianMsisdn(input: string): string | null {
  const digits = (input ?? '').replace(/\D/g, '');
  if (!digits) return null;

  // Strip an international-access prefix (00509…) or a leading 0 before 509.
  let d = digits;
  if (d.startsWith('00509')) d = d.slice(2);
  else if (d.startsWith('0509')) d = d.slice(1);

  if (d.startsWith('509')) d = d.slice(3);
  if (d.length !== 8) return null;
  // Haitian mobile prefixes: Digicel 3x/4x, Natcom 2x/e-block 5x.
  if (!/^[2345]/.test(d)) return null;
  return `509${d}`;
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

  // Key includes mode + client id so rotating a key or flipping to live can
  // never serve a token minted for the other environment.
  const key = `${moncashMode()}:${clientId}`;
  if (cachedToken && cachedToken.key === key && Date.now() < cachedToken.expiresAtMs) {
    return { ok: true, token: cachedToken.accessToken };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Digicel's own example posts these as multipart form-data; urlencoded is
    // the equivalent standard OAuth2 body and is what every server accepts.
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

/** Test seam: drop the cached bearer. Harmless in production. */
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
    // 201 Created is InitiatePayment's success code — `res.ok` covers 2xx.
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Our cached bearer was rejected (these expire in under a minute) —
      // drop it so the very next call re-mints instead of looping on it.
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

/* ----------------------------- initiate ---------------------------------- */

export type MoncashInitiated = {
  ok: true;
  reference: string;
  /** null on initiate — MonCash assigns it once the buyer responds. */
  transactionId: string | null;
  message: string;
};

/**
 * Pushes a cash-out request to the buyer's handset. Returns as soon as MonCash
 * accepts it (`message: "pending"`); the buyer then approves on their phone
 * and `checkMoncashPayment` reports the outcome.
 *
 * `reference` is OUR order id (the checkout_sessions row) — it is both what
 * we poll by and what makes fulfilment idempotent, so never reuse one.
 * `amountHtg` is whole gourdes; MonCash has no sub-unit.
 */
export async function initiateMoncashPayment(input: {
  reference: string;
  /** Buyer's MonCash number, already normalised by `normalizeHaitianMsisdn`. */
  account: string;
  amountHtg: number;
}): Promise<MoncashInitiated | MoncashFailure> {
  if (!moncashConfigured()) return { ok: false, message: 'not_configured' };
  if (!input.reference.trim()) return { ok: false, message: 'bad_reference' };
  if (!/^509\d{8}$/.test(input.account)) return { ok: false, message: 'bad_account' };
  if (!Number.isInteger(input.amountHtg) || input.amountHtg <= 0) {
    return { ok: false, message: 'bad_amount' };
  }

  const r = await post<{ reference?: string; transactionId?: string | null; message?: string }>(
    INITIATE_PATH,
    { reference: input.reference, account: input.account, amount: input.amountHtg },
  );
  if (!r.ok) return r;

  return {
    ok: true,
    reference: r.data.reference ?? input.reference,
    transactionId: r.data.transactionId ?? null,
    message: String(r.data.message ?? 'pending'),
  };
}

/* ------------------------------- check ----------------------------------- */

export type MoncashStatus = {
  ok: true;
  /** True only when MonCash says the money actually moved. */
  paid: boolean;
  /** True while the buyer has not yet approved (or declined) on their phone. */
  pending: boolean;
  reference: string | null;
  transactionId: string | null;
  /** Gourdes MonCash reports as charged. */
  amountHtg: number | null;
  account: string | null;
  message: string;
};

type CheckResponse = {
  reference?: string;
  transactionId?: string | null;
  amount?: number;
  account?: string;
  message?: string;
};

/**
 * Pure — the ONE place MonCash's success word lives. Their `CheckPayment`
 * reports `message: "successful"` when the money moved and `"pending"` while
 * the buyer has not answered. "Did we get paid" is the most consequential
 * boolean in this app, so it is exported and directly unit-tested rather than
 * inlined into a route.
 */
export function isMoncashPaid(body: unknown): boolean {
  const message = (body as CheckResponse | null)?.message;
  return String(message ?? '').trim().toLowerCase() === 'successful';
}

/** Pure — still waiting on the buyer's handset (neither paid nor failed). */
export function isMoncashPending(body: unknown): boolean {
  const message = String((body as CheckResponse | null)?.message ?? '').trim().toLowerCase();
  return message === 'pending' || message === 'created';
}

function mapCheck(body: CheckResponse): MoncashStatus {
  return {
    ok: true,
    paid: isMoncashPaid(body),
    pending: isMoncashPending(body),
    reference: body.reference ?? null,
    transactionId: body.transactionId ?? null,
    amountHtg: typeof body.amount === 'number' ? body.amount : null,
    account: body.account ?? null,
    message: String(body.message ?? ''),
  };
}

/** Looks a payment up by OUR order reference — the authoritative "was it paid". */
export async function checkMoncashPaymentByReference(
  reference: string,
): Promise<MoncashStatus | MoncashFailure> {
  if (!moncashConfigured()) return { ok: false, message: 'not_configured' };
  if (!reference.trim()) return { ok: false, message: 'bad_reference' };
  const r = await post<CheckResponse>(CHECK_PATH, { reference });
  return r.ok ? mapCheck(r.data) : r;
}

/** Same, by MonCash's own transaction id (used when a callback supplies one). */
export async function checkMoncashPaymentByTransaction(
  transactionId: string,
): Promise<MoncashStatus | MoncashFailure> {
  if (!moncashConfigured()) return { ok: false, message: 'not_configured' };
  if (!transactionId.trim()) return { ok: false, message: 'bad_transaction_id' };
  const r = await post<CheckResponse>(CHECK_PATH, { transactionId });
  return r.ok ? mapCheck(r.data) : r;
}

/* -------------------------------- money ---------------------------------- */

/**
 * Pure — USD cents to whole gourdes at `rate`. Rounds to the nearest gourde
 * because MonCash has no sub-unit: a fractional amount would be silently
 * truncated by their gateway, so the rounding is explicit and testable here.
 * Always at least 1 gourde for any non-zero price — a paid course must never
 * become free through a rounding accident.
 */
export function usdCentsToHtg(amountCents: number, rate: number): number {
  if (!Number.isFinite(amountCents) || !Number.isFinite(rate) || amountCents <= 0 || rate <= 0) return 0;
  return Math.max(1, Math.round((amountCents / 100) * rate));
}
