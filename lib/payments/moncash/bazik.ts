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

export function bazikConfigured(): boolean {
  return Boolean(process.env.BAZIK_USER_ID?.trim() && process.env.BAZIK_SECRET_KEY?.trim());
}

/**
 * DISPLAY ONLY. Bazik picks the environment from the credentials, so this is
 * an inference from their documented key-naming convention
 * (`bzk_sandbox_…` / `bzk_production_…`) purely so the admin page can say
 * which environment it believes it is in. Nothing branches on it — an
 * unrecognised prefix reads as 'sandbox', the cautious answer.
 */
export function bazikMode(): MoncashMode {
  const id = process.env.BAZIK_USER_ID?.trim().toLowerCase() ?? '';
  return id.includes('production') || id.includes('_live') ? 'live' : 'sandbox';
}

/* --------------------------------- token --------------------------------- */

type CachedToken = { accessToken: string; userId: string; expiresAtMs: number; key: string };
let cachedToken: CachedToken | null = null;

/** Test seam: drop the cached bearer. Harmless in production. */
export function resetBazikTokenCache(): void {
  cachedToken = null;
}

async function getToken(): Promise<{ ok: true; token: string; userId: string } | MoncashFailure> {
  const userID = process.env.BAZIK_USER_ID?.trim();
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
    const data = (await res.json().catch(() => null)) as
      | { access_token?: string; expires_in?: number; user_id?: string }
      | null;
    const accessToken = data?.access_token;
    if (!accessToken) return { ok: false, message: 'auth_no_token' };

    // Their /moncash/token wants a `userID` in the BODY too, and the token
    // response is the authoritative source for it — prefer it over our env
    // value so a credential that resolves to a different account id still works.
    const resolvedUserId = data?.user_id ?? userID;
    const ttl = Math.max(60, Number(data?.expires_in ?? 3600) - TOKEN_SAFETY_WINDOW_S);
    cachedToken = {
      accessToken,
      userId: resolvedUserId,
      expiresAtMs: Date.now() + ttl * 1000,
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

      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { orderId?: string; redirectUrl?: string } }
        | null;
      const redirectUrl = data?.data?.redirectUrl;
      const orderId = data?.data?.orderId;
      if (!redirectUrl || !orderId) return { ok: false, message: 'no_redirect_url' };

      return {
        ok: true,
        redirectUrl,
        // THEIR id — `GET /order/{orderId}` is the only way to verify later,
        // and our own reference will not resolve there.
        providerRef: orderId,
        mode: bazikMode(),
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
  const d = (body as BazikOrderBody | null)?.data;
  if (!d) return false;
  if (d.paid === true) return true;
  const word = String(d.status ?? d.state ?? d.message ?? '').trim().toLowerCase();
  return word === 'successful' || word === 'success' || word === 'completed' || word === 'paid';
}

function mapBazikOrder(body: unknown): MoncashPayment {
  const d = (body as BazikOrderBody | null)?.data ?? {};
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
