/**
 * lib/payments/moncash/bazik.ts — MonCash through Bazik (api.bazik.io).
 *
 * WHY THIS EXISTS: Digicel's own API needs a merchant contract that takes
 * weeks. Bazik is a Haitian aggregator that fronts MonCash with self-serve
 * credentials, so this platform can accept MonCash while that paperwork is in
 * flight. Same buyer experience (a hosted MonCash page), different plumbing.
 *
 * THREE DIFFERENCES FROM THE DIRECT PROVIDER, each of which shaped this file:
 *
 *   1. THE ENVIRONMENT LIVES IN THE CREDENTIALS. Bazik has one base URL for
 *      both sandbox and production and decides which MonCash to route to from
 *      the key you authenticate with. There is no mode to set and no mode to
 *      get wrong — but it also means this module cannot *know* the mode, so it
 *      infers it from the credential prefix for display only, and never uses
 *      that inference to decide anything.
 *   2. THE RETURN URLS ARE PER REQUEST. Bazik takes successUrl, errorUrl and
 *      webhookUrl on each payment, where Digicel fixes them once in a portal.
 *      That is strictly better — the buyer can be returned to a URL that
 *      already knows which order and which language — so `createOrder` passes
 *      them through.
 *   3. THE ORDER ID IS THEIRS, NOT OURS. We send `referenceId` (our checkout
 *      row) and Bazik mints its own `orderId` (`BZK_sandbox_…`). Verification
 *      is `GET /order/{their orderId}`, so THEIR id is what must be persisted
 *      — this is exactly why `MoncashOrder.providerRef` exists instead of the
 *      caller assuming it can reuse its own reference.
 *
 * ENV-GATED + NEVER-THROW, like every payment module here: missing keys give
 * `not_configured`, and any network/parse failure resolves to a message.
 *
 * SECURITY: `BAZIK_USER_ID`/`BAZIK_SECRET_KEY` are read at call time, used
 * only to mint a bearer server-side, and never returned or sent to the
 * browser.
 */
import type {
  MoncashCreateInput,
  MoncashFailure,
  MoncashMode,
  MoncashOrder,
  MoncashPayment,
  MoncashProvider,
} from './types';

const BASE = 'https://api.bazik.io';
const TOKEN_PATH = '/token';
const CREATE_PATH = '/moncash/token';
const ORDER_PATH = '/order';

const TIMEOUT_MS = 20_000;
/** Bazik's tokens are long-lived (86 400s in their docs); a minute of margin is ample. */
const TOKEN_SAFETY_WINDOW_S = 60;

/**
 * Bazik calls this field `userID`, which invites both `BAZIK_USER_ID` and the
 * shorter `BAZIK_ID` when someone types it from memory. Accepting either costs
 * one line and removes a failure that would otherwise show up as a silent
 * "MonCash not configured" on a deployment nobody thinks to re-check.
 */
function bazikUserId(): string | undefined {
  return process.env.BAZIK_USER_ID?.trim() || process.env.BAZIK_ID?.trim() || undefined;
}

export function bazikConfigured(): boolean {
  return Boolean(bazikUserId() && process.env.BAZIK_SECRET_KEY?.trim());
}

/**
 * Which environment Bazik will route to. Bazik decides this from the
 * credentials alone, so this can only be inferred — and the direction of the
 * guess is a safety decision, not a cosmetic one.
 *
 * IT DEFAULTS TO 'live'. A real account id looks like `bzk_ed99283b_17865…`
 * and says nothing about the environment, yet that exact key returns
 * `"environment":"production"` and moves REAL money. Reporting 'sandbox' there
 * would put "SANDBOX — argent fictif" on the admin page above a button that
 * really charges someone — the worst possible lie. Guessing 'live' when it is
 * actually sandbox merely over-warns, which costs nothing.
 *
 * Only an explicit signal downgrades it: `BAZIK_MODE=sandbox`, or a
 * credential that literally says so.
 */
export function bazikMode(): MoncashMode {
  const explicit = process.env.BAZIK_MODE?.trim().toLowerCase();
  if (explicit === 'sandbox') return 'sandbox';
  if (explicit === 'live') return 'live';
  const id = bazikUserId()?.toLowerCase() ?? '';
  return id.includes('sandbox') || id.includes('_test') ? 'sandbox' : 'live';
}

/* --------------------------------- token --------------------------------- */

type CachedToken = { accessToken: string; userId: string; expiresAtMs: number; key: string };
let cachedToken: CachedToken | null = null;

/** Both the documented and the actually-served shapes — see `getToken`. */
type BazikTokenBody = {
  /** What the live API returns. */
  token?: string;
  /** What their docs promise. */
  access_token?: string;
  user_id?: string;
  /** Live API: absolute epoch milliseconds. */
  expires_at?: number;
  /** Docs: seconds from now. */
  expires_in?: number;
};

/**
 * Pure — when to stop trusting a token, from either expiry style.
 *
 * `expires_at` is an absolute epoch-ms instant (what the API really sends);
 * `expires_in` is seconds from now (what the docs describe). Both are pulled
 * back by a safety window so an in-flight call can't age out mid-request, and
 * both are floored at one minute: a server clock skewed into the past would
 * otherwise produce a token that is expired on arrival and re-authenticate on
 * every single call.
 */
export function tokenExpiryMs(
  body: { expires_at?: number; expires_in?: number } | null | undefined,
  now = Date.now(),
): number {
  const floor = now + 60_000;
  const at = Number(body?.expires_at);
  if (Number.isFinite(at) && at > 0) return Math.max(floor, at - TOKEN_SAFETY_WINDOW_S * 1000);
  const seconds = Number(body?.expires_in);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.max(floor, now + (seconds - TOKEN_SAFETY_WINDOW_S) * 1000);
  }
  // Neither field present: keep it briefly rather than forever.
  return now + 5 * 60_000;
}

/** Test seam: drop the cached bearer. Harmless in production. */
export function resetBazikTokenCache(): void {
  cachedToken = null;
}

async function getToken(): Promise<{ ok: true; token: string; userId: string } | MoncashFailure> {
  const userID = bazikUserId();
  const secretKey = process.env.BAZIK_SECRET_KEY?.trim();
  if (!userID || !secretKey) return { ok: false, message: 'not_configured' };

  if (cachedToken && cachedToken.key === userID && Date.now() < cachedToken.expiresAtMs) {
    return { ok: true, token: cachedToken.accessToken, userId: cachedToken.userId };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${TOKEN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ userID, secretKey }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, message: await describeError(res) };
    }
    const data = (await res.json().catch(() => null)) as BazikTokenBody | null;

    // THEIR DOCS AND THEIR API DISAGREE — verified against the live endpoint.
    // The docs advertise `{access_token, token_type, expires_in}`; the server
    // actually returns `{success, token, user_id, expires_at}`. Both shapes are
    // accepted so this keeps working whichever one a given account or a future
    // fix produces.
    const accessToken = data?.token ?? data?.access_token;
    if (!accessToken) return { ok: false, message: 'auth_no_token' };

    // Their /moncash/token wants a `userID` in the BODY too, and the token
    // response is the authoritative source for it — prefer it over our env
    // value so a credential that resolves to a different account id still works.
    const resolvedUserId = data?.user_id ?? userID;
    cachedToken = {
      accessToken,
      userId: resolvedUserId,
      expiresAtMs: tokenExpiryMs(data),
      key: userID,
    };
    return { ok: true, token: accessToken, userId: resolvedUserId };
  } catch (e) {
    const message = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : 'error';
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bazik returns `{ error, message }` on failure. Surfacing THEIR message is
 * the point: their `message` field is written to be shown to a human, and a
 * generic "HTTP 400" would throw away the only useful part of the response.
 */
async function describeError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  try {
    const j = JSON.parse(body) as { error?: string; message?: string };
    const detail = j.message ?? j.error;
    if (detail) return `HTTP ${res.status} — ${String(detail).slice(0, 200)}`;
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return `HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`;
}

/* ------------------------------- provider -------------------------------- */

export const bazikProvider: MoncashProvider = {
  id: 'bazik',
  configured: bazikConfigured,
  mode: bazikMode,
  label: () => `Bazik — ${BASE} (${bazikMode()})`,

  async createOrder(input: MoncashCreateInput): Promise<MoncashOrder | MoncashFailure> {
    if (!bazikConfigured()) return { ok: false, message: 'not_configured' };
    if (!input.orderId.trim()) return { ok: false, message: 'bad_order_id' };
    if (!Number.isInteger(input.amountHtg) || input.amountHtg <= 0) {
      return { ok: false, message: 'bad_amount' };
    }

    const auth = await getToken();
    if (!auth.ok) return auth;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${CREATE_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          gdes: input.amountHtg,
          userID: auth.userId,
          referenceId: input.orderId,
          ...(input.description ? { description: input.description } : {}),
          ...(input.successUrl ? { successUrl: input.successUrl } : {}),
          ...(input.errorUrl ? { errorUrl: input.errorUrl } : {}),
          ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, message: await describeError(res) };

      const body = (await res.json().catch(() => null)) as BazikCreateBody | null;

      // ANOTHER DOCS-VS-REALITY GAP, verified live: the docs show the payment
      // wrapped in `{success, data:{…}}`, but the server returns those fields
      // FLAT at the top level. Both are read so this survives either.
      const flat = body?.data ?? body;
      const redirectUrl = flat?.redirectUrl;
      const orderId = flat?.orderId;
      if (!redirectUrl || !orderId) return { ok: false, message: 'no_redirect_url' };

      return {
        ok: true,
        // Bazik passes Digicel's redirect through verbatim, and Digicel's own
        // SDK emits `http://`. Sending a buyer to a plaintext payment page —
        // where they type a wallet PIN — is not acceptable, so it is upgraded
        // here rather than trusted.
        redirectUrl: redirectUrl.replace(/^http:\/\//i, 'https://'),
        // THEIR id — `GET /order/{orderId}` is the only way to verify later,
        // and our own reference will not resolve there.
        providerRef: orderId,
        // Prefer what the response SAYS over what we inferred: this is the one
        // moment Bazik tells us the truth about the environment.
        mode: flat?.environment === 'production' ? 'live' : bazikMode(),
        provider: 'bazik',
      };
    } catch (e) {
      const message = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : 'error';
      return { ok: false, message };
    } finally {
      clearTimeout(timer);
    }
  },

  async checkOrder(providerRef: string): Promise<MoncashPayment | MoncashFailure> {
    if (!bazikConfigured()) return { ok: false, message: 'not_configured' };
    if (!providerRef.trim()) return { ok: false, message: 'bad_order_id' };

    const auth = await getToken();
    if (!auth.ok) return auth;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${ORDER_PATH}/${encodeURIComponent(providerRef)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${auth.token}`, accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, message: await describeError(res) };

      const body = (await res.json().catch(() => null)) as unknown;
      if (!body) return { ok: false, message: 'bad_json' };
      return mapBazikOrder(body);
    } catch (e) {
      const message = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : 'error';
      return { ok: false, message };
    } finally {
      clearTimeout(timer);
    }
  },
};

/* -------------------------------- mapping -------------------------------- */

/** Create-payment response — flat in practice, wrapped in the docs. */
type BazikCreateFields = { orderId?: string; redirectUrl?: string; environment?: string };
type BazikCreateBody = BazikCreateFields & { success?: boolean; data?: BazikCreateFields };

type BazikOrderBody = {
  success?: boolean;
  data?: {
    status?: string;
    state?: string;
    message?: string;
    paid?: boolean;
    amount?: number;
    gdes?: number;
    transactionId?: string;
    transaction_id?: string;
    payer?: string;
    wallet?: string;
  };
};

/**
 * Pure — reads "was this paid" out of Bazik's order payload, and exported so
 * the single most consequential boolean in the app has a direct unit test.
 *
 * Bazik's docs give the create/auth shapes precisely but not the verification
 * body, so this accepts the several spellings such gateways use
 * (`status: "successful"|"success"|"completed"|"paid"`, or an explicit
 * `paid: true`) and treats ANYTHING ELSE as unpaid. Erring that way is the
 * safe direction: an unrecognised success word delays access until the next
 * check, whereas an over-eager match would give a course away.
 */
export function isBazikPaid(body: unknown): boolean {
  const b = body as BazikOrderBody | null;
  const d = b?.data ?? (b as NonNullable<BazikOrderBody>['data']);
  if (!d || typeof d !== 'object') return false;
  if (d.paid === true) return true;
  const word = String(d.status ?? d.state ?? d.message ?? '').trim().toLowerCase();
  return word === 'successful' || word === 'success' || word === 'completed' || word === 'paid';
}

function mapBazikOrder(body: unknown): MoncashPayment {
  // Flat in practice, wrapped in the docs — read both, like create does.
  const b = body as BazikOrderBody | null;
  const d = b?.data ?? (b as NonNullable<BazikOrderBody>['data']) ?? {};
  const amount = typeof d.gdes === 'number' ? d.gdes : typeof d.amount === 'number' ? d.amount : null;
  return {
    ok: true,
    paid: isBazikPaid(body),
    transactionId: d.transactionId ?? d.transaction_id ?? null,
    amountHtg: amount,
    payer: d.payer ?? d.wallet ?? null,
    raw: body,
  };
}
