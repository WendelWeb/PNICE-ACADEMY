import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  pickMoncashProvider,
  moncashConfigured,
  moncashProviderId,
  createMoncashOrder,
  retrieveMoncashOrder,
  resetMoncashTokenCache,
} from '@/lib/payments/moncash';
import { isBazikPaid, bazikMode, tokenExpiryMs } from '@/lib/payments/moncash/bazik';
import {
  encodeMoncashRef,
  decodeMoncashLocale,
  decodeMoncashProviderRef,
  isMoncashRef,
} from '@/lib/payments/moncash-order';

const ENV = { ...process.env };
beforeEach(() => {
  resetMoncashTokenCache();
  for (const k of [
    'MONCASH_CLIENT_ID',
    'MONCASH_CLIENT_SECRET',
    'MONCASH_MODE',
    'MONCASH_PROVIDER',
    'BAZIK_USER_ID',
    'BAZIK_SECRET_KEY',
  ]) {
    delete process.env[k];
  }
});
afterEach(() => {
  process.env = { ...ENV };
  vi.restoreAllMocks();
});

const withDirect = () => {
  process.env.MONCASH_CLIENT_ID = 'id';
  process.env.MONCASH_CLIENT_SECRET = 'secret';
};
const withBazik = () => {
  process.env.BAZIK_USER_ID = 'bzk_sandbox_abc';
  process.env.BAZIK_SECRET_KEY = 'sk_sandbox_xyz';
};

describe('pickMoncashProvider', () => {
  const none = { direct: false, bazik: false };

  it('falls back to whichever provider has credentials', () => {
    expect(pickMoncashProvider(undefined, { direct: true, bazik: false })).toBe('direct');
    expect(pickMoncashProvider(undefined, { direct: false, bazik: true })).toBe('bazik');
    expect(pickMoncashProvider(undefined, none)).toBeNull();
  });

  it('prefers direct when both are configured — it is the cheaper path', () => {
    expect(pickMoncashProvider(undefined, { direct: true, bazik: true })).toBe('direct');
  });

  it('honours an explicit choice', () => {
    expect(pickMoncashProvider('bazik', { direct: true, bazik: true })).toBe('bazik');
    expect(pickMoncashProvider('direct', { direct: true, bazik: true })).toBe('direct');
    expect(pickMoncashProvider('  BAZIK  ', { direct: true, bazik: true })).toBe('bazik');
  });

  /**
   * The property that matters most: naming an unconfigured provider must NOT
   * silently charge through the other company. A typo has to surface as "not
   * configured", never as a quiet substitution.
   */
  it('refuses rather than substituting when the named provider is unconfigured', () => {
    expect(pickMoncashProvider('bazik', { direct: true, bazik: false })).toBeNull();
    expect(pickMoncashProvider('direct', { direct: false, bazik: true })).toBeNull();
  });

  it('treats an unknown name as "no preference" rather than an error', () => {
    expect(pickMoncashProvider('paypal', { direct: true, bazik: false })).toBe('direct');
  });
});

describe('facade wiring', () => {
  it('is unconfigured until some provider has credentials', () => {
    expect(moncashConfigured()).toBe(false);
    expect(moncashProviderId()).toBeNull();
    withBazik();
    expect(moncashConfigured()).toBe(true);
    expect(moncashProviderId()).toBe('bazik');
  });

  it('routes to the provider named by MONCASH_PROVIDER', () => {
    withDirect();
    withBazik();
    expect(moncashProviderId()).toBe('direct');
    process.env.MONCASH_PROVIDER = 'bazik';
    expect(moncashProviderId()).toBe('bazik');
  });

  it('never throws when nothing is configured', async () => {
    await expect(createMoncashOrder({ orderId: 'o', amountHtg: 100 })).resolves.toEqual({
      ok: false,
      message: 'not_configured',
    });
    await expect(retrieveMoncashOrder('o')).resolves.toEqual({ ok: false, message: 'not_configured' });
  });
});

describe('bazik provider', () => {
  beforeEach(withBazik);

  it('authenticates, then creates a payment and returns BAZIK’s own order id', async () => {
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: String(url), body: String(init?.body ?? ''), auth: headers.Authorization ?? '' });
      if (String(url) === 'https://api.bazik.io/token') {
        return new Response(
          JSON.stringify({ access_token: 'AT', token_type: 'bearer', expires_in: 86400, user_id: 'bzk_u' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            orderId: 'BZK_sandbox_abc_123',
            redirectUrl: 'https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/xyz',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const r = await createMoncashOrder({
      orderId: 'our-order-1',
      amountHtg: 1188,
      successUrl: 'https://pniceacademy.com/ok',
      webhookUrl: 'https://pniceacademy.com/hook',
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe('bazik');
      // THE point of providerRef: Bazik's id, not ours.
      expect(r.providerRef).toBe('BZK_sandbox_abc_123');
      expect(r.redirectUrl).toContain('moncashbutton');
    }

    expect(calls[0].url).toBe('https://api.bazik.io/token');
    expect(JSON.parse(calls[0].body)).toEqual({ userID: 'bzk_sandbox_abc', secretKey: 'sk_sandbox_xyz' });

    expect(calls[1].url).toBe('https://api.bazik.io/moncash/token');
    expect(calls[1].auth).toBe('Bearer AT');
    const sent = JSON.parse(calls[1].body);
    expect(sent.gdes).toBe(1188);
    expect(sent.referenceId).toBe('our-order-1');
    // The user id comes from the TOKEN response, not the env value.
    expect(sent.userID).toBe('bzk_u');
    expect(sent.successUrl).toBe('https://pniceacademy.com/ok');
    expect(sent.webhookUrl).toBe('https://pniceacademy.com/hook');
  });

  it('verifies by GET /order/{their id}', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      urls.push(String(url));
      if (String(url) === 'https://api.bazik.io/token') {
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 86400, user_id: 'u' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ success: true, data: { status: 'successful', gdes: 1188, transactionId: 'TX9' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const r = await retrieveMoncashOrder('BZK_sandbox_abc_123');
    expect(urls[1]).toBe('https://api.bazik.io/order/BZK_sandbox_abc_123');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paid).toBe(true);
      expect(r.amountHtg).toBe(1188);
      expect(r.transactionId).toBe('TX9');
    }
  });

  it('surfaces Bazik’s own error message instead of a bare status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Missing required parameters', message: 'Amount and userID are required' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Amount and userID are required');
  });

  it('rejects a fractional amount before any network call', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(createMoncashOrder({ orderId: 'o', amountHtg: 12.5 })).resolves.toEqual({
      ok: false,
      message: 'bad_amount',
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('isBazikPaid', () => {
  it('accepts the spellings a gateway plausibly uses', () => {
    for (const s of ['successful', 'success', 'completed', 'paid', 'SUCCESSFUL']) {
      expect(isBazikPaid({ data: { status: s } }), s).toBe(true);
    }
    expect(isBazikPaid({ data: { paid: true } })).toBe(true);
  });

  /** Erring toward "unpaid" only delays access; erring the other way gives a course away. */
  it('treats anything unrecognised as UNPAID', () => {
    for (const s of ['pending', 'failed', 'cancelled', 'processing', '']) {
      expect(isBazikPaid({ data: { status: s } }), s).toBe(false);
    }
    expect(isBazikPaid({ data: {} })).toBe(false);
    expect(isBazikPaid({})).toBe(false);
    expect(isBazikPaid(null)).toBe(false);
    expect(isBazikPaid('successful')).toBe(false);
  });
});

describe('checkout-row reference encoding', () => {
  it('round-trips locale alone (the pre-provider-ref shape)', () => {
    expect(decodeMoncashLocale(encodeMoncashRef('fr'))).toBe('fr');
    expect(decodeMoncashLocale(encodeMoncashRef('ht'))).toBe('ht');
    expect(decodeMoncashProviderRef(encodeMoncashRef('ht'))).toBeNull();
  });

  it('round-trips locale AND the provider reference', () => {
    const ref = encodeMoncashRef('fr', 'BZK_sandbox_abc_123');
    expect(decodeMoncashLocale(ref)).toBe('fr');
    expect(decodeMoncashProviderRef(ref)).toBe('BZK_sandbox_abc_123');
  });

  it('still identifies the row as MonCash, so the Stripe guard skips it', () => {
    expect(isMoncashRef(encodeMoncashRef('ht', 'BZK_x'))).toBe(true);
    expect(isMoncashRef('cs_test_a1b2c3')).toBe(false);
    expect(isMoncashRef(null)).toBe(false);
  });

  it('reads a Stripe session id as neither MonCash nor a provider ref', () => {
    expect(decodeMoncashProviderRef('cs_test_a1b2c3')).toBeNull();
    expect(decodeMoncashLocale('cs_test_a1b2c3')).toBe('ht');
  });
});

describe('bazik: the live API disagrees with its own docs', () => {
  /**
   * Every case here was captured from Bazik's real responses. The docs promise
   * one shape and the server sends another; these tests pin the SERVER, which
   * is the only thing that actually pays for a course.
   */
  it('reads the token from `token` (live) as well as `access_token` (docs)', async () => {
    process.env.BAZIK_ID = 'bzk_ed99283b_1786543705';
    process.env.BAZIK_SECRET_KEY = 'sk_x';
    const seen: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url) === 'https://api.bazik.io/token') {
        // The real payload: no access_token, no expires_in, no token_type.
        return new Response(
          JSON.stringify({
            success: true,
            token: 'LIVE_TOKEN',
            user_id: 'bzk_ed99283b_1786543705',
            expires_at: Date.now() + 86_400_000,
            message: 'Authentication successful',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      seen.push(((init?.headers ?? {}) as Record<string, string>).Authorization ?? '');
      return new Response(
        JSON.stringify({ orderId: 'BZK_production_x', redirectUrl: 'https://pay/x', environment: 'production' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 5 });
    expect(r.ok).toBe(true);
    expect(seen[0]).toBe('Bearer LIVE_TOKEN');
  });

  it('reads orderId/redirectUrl FLAT, not wrapped in `data`', async () => {
    process.env.BAZIK_ID = 'bzk_x';
    process.env.BAZIK_SECRET_KEY = 'sk_x';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === 'https://api.bazik.io/token') {
        return new Response(JSON.stringify({ token: 'T', user_id: 'u', expires_at: Date.now() + 60_000 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          orderId: 'BZK_production_ed99283b_1786583330619_r2rb',
          // Digicel's own SDK emits http:// and Bazik passes it through.
          redirectUrl: 'http://moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=abc',
          environment: 'production',
          status: 'pending',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.providerRef).toBe('BZK_production_ed99283b_1786583330619_r2rb');
      // A buyer types a wallet PIN on that page — it must never be plaintext.
      expect(r.redirectUrl.startsWith('https://')).toBe(true);
      // The response is believed over any inference.
      expect(r.mode).toBe('live');
    }
  });

  it('defaults to live when the credential says nothing — over-warning is the safe direction', () => {
    process.env.BAZIK_ID = 'bzk_ed99283b_1786543705';
    process.env.BAZIK_SECRET_KEY = 'sk_x';
    expect(bazikMode()).toBe('live');
    process.env.BAZIK_MODE = 'sandbox';
    expect(bazikMode()).toBe('sandbox');
    delete process.env.BAZIK_MODE;
    process.env.BAZIK_ID = 'bzk_sandbox_abc';
    expect(bazikMode()).toBe('sandbox');
  });

  it('accepts BAZIK_ID as well as BAZIK_USER_ID', () => {
    process.env.BAZIK_SECRET_KEY = 'sk_x';
    process.env.BAZIK_ID = 'bzk_a';
    expect(moncashProviderId()).toBe('bazik');
    delete process.env.BAZIK_ID;
    process.env.BAZIK_USER_ID = 'bzk_a';
    expect(moncashProviderId()).toBe('bazik');
  });

  it('tokenExpiryMs handles both expiry styles and never returns the past', () => {
    const now = 1_000_000_000_000;
    expect(tokenExpiryMs({ expires_at: now + 86_400_000 }, now)).toBe(now + 86_400_000 - 60_000);
    expect(tokenExpiryMs({ expires_in: 3600 }, now)).toBe(now + (3600 - 60) * 1000);
    // A skewed/expired timestamp must not produce a token that is dead on arrival.
    expect(tokenExpiryMs({ expires_at: now - 5000 }, now)).toBe(now + 60_000);
    expect(tokenExpiryMs({}, now)).toBe(now + 300_000);
  });
});
