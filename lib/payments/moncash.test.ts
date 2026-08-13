import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  moncashConfigured,
  moncashMode,
  moncashHost,
  moncashRedirectUrl,
  moncashBasicAuth,
  isMoncashPaid,
  usdCentsToHtg,
  createMoncashOrder,
  retrieveMoncashOrder,
  resetMoncashTokenCache,
} from '@/lib/payments/moncash';

const ENV = { ...process.env };
beforeEach(() => {
  resetMoncashTokenCache();
  delete process.env.MONCASH_CLIENT_ID;
  delete process.env.MONCASH_CLIENT_SECRET;
  delete process.env.MONCASH_MODE;
});
afterEach(() => {
  process.env = { ...ENV };
  vi.restoreAllMocks();
});

describe('gating', () => {
  it('is not configured until BOTH credentials are set', () => {
    expect(moncashConfigured()).toBe(false);
    process.env.MONCASH_CLIENT_ID = 'id';
    expect(moncashConfigured()).toBe(false);
    process.env.MONCASH_CLIENT_SECRET = 'secret';
    expect(moncashConfigured()).toBe(true);
  });

  it('never throws when unconfigured — it resolves not_configured', async () => {
    await expect(createMoncashOrder({ orderId: 'o1', amountHtg: 500 })).resolves.toEqual({
      ok: false,
      message: 'not_configured',
    });
    await expect(retrieveMoncashOrder('o1')).resolves.toEqual({ ok: false, message: 'not_configured' });
  });
});

describe('mode and hosts', () => {
  it('defaults to sandbox — going live must be deliberate', () => {
    expect(moncashMode()).toBe('sandbox');
    expect(moncashHost()).toBe('sandbox.moncashbutton.digicelgroup.com');
  });

  it('switches to the live host only on MONCASH_MODE=live', () => {
    // `moncashMode()` now reports the ACTIVE provider's mode, so a provider
    // has to be configured for the question to mean anything — with none, it
    // answers 'sandbox', the cautious default.
    process.env.MONCASH_CLIENT_ID = 'id';
    process.env.MONCASH_CLIENT_SECRET = 'secret';

    process.env.MONCASH_MODE = 'live';
    expect(moncashMode()).toBe('live');
    expect(moncashHost()).toBe('moncashbutton.digicelgroup.com');
    process.env.MONCASH_MODE = 'LIVE';
    expect(moncashMode()).toBe('live');
    process.env.MONCASH_MODE = 'production'; // not the magic word
    expect(moncashMode()).toBe('sandbox');
  });

  it('builds an https redirect URL for the right environment', () => {
    expect(moncashRedirectUrl('tok123', 'sandbox')).toBe(
      'https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=tok123',
    );
    expect(moncashRedirectUrl('tok123', 'live')).toBe(
      'https://moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=tok123',
    );
  });

  it('url-encodes the token', () => {
    expect(moncashRedirectUrl('a b/c+d', 'sandbox')).toContain('token=a%20b%2Fc%2Bd');
  });
});

describe('moncashBasicAuth', () => {
  it('base64-encodes id:secret', () => {
    expect(moncashBasicAuth('user', 'pass')).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
  });
});

describe('isMoncashPaid', () => {
  it('is true only for a successful payment message', () => {
    expect(isMoncashPaid({ payment: { message: 'successful' } })).toBe(true);
    expect(isMoncashPaid({ payment: { message: 'SUCCESSFUL' } })).toBe(true);
    expect(isMoncashPaid({ payment: { message: ' successful ' } })).toBe(true);
  });

  it('is false for anything else — including shapes that merely look positive', () => {
    expect(isMoncashPaid({ payment: { message: 'pending' } })).toBe(false);
    expect(isMoncashPaid({ payment: { message: 'failed' } })).toBe(false);
    expect(isMoncashPaid({ payment: {} })).toBe(false);
    expect(isMoncashPaid({ status: 200 })).toBe(false);
    expect(isMoncashPaid(null)).toBe(false);
    expect(isMoncashPaid(undefined)).toBe(false);
    expect(isMoncashPaid('successful')).toBe(false);
  });
});

describe('usdCentsToHtg', () => {
  it('converts at the given rate, rounded to whole gourdes', () => {
    expect(usdCentsToHtg(900, 132)).toBe(1188); // $9.00 × 132
    expect(usdCentsToHtg(4900, 132)).toBe(6468); // $49.00 × 132
    expect(usdCentsToHtg(100, 132.5)).toBe(133); // rounds 132.5 → 133
  });

  it('never turns a paid course into a free one', () => {
    expect(usdCentsToHtg(1, 0.4)).toBe(1); // would round to 0
  });

  it('is 0 for non-purchases and rejects nonsense input instead of guessing', () => {
    expect(usdCentsToHtg(0, 132)).toBe(0);
    expect(usdCentsToHtg(-900, 132)).toBe(0);
    expect(usdCentsToHtg(900, 0)).toBe(0);
    expect(usdCentsToHtg(900, -1)).toBe(0);
    expect(usdCentsToHtg(Number.NaN, 132)).toBe(0);
    expect(usdCentsToHtg(900, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('createMoncashOrder', () => {
  beforeEach(() => {
    process.env.MONCASH_CLIENT_ID = 'id';
    process.env.MONCASH_CLIENT_SECRET = 'secret';
  });

  it('refuses a fractional or non-positive amount before any network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(createMoncashOrder({ orderId: 'o1', amountHtg: 12.5 })).resolves.toEqual({
      ok: false,
      message: 'bad_amount',
    });
    await expect(createMoncashOrder({ orderId: 'o1', amountHtg: 0 })).resolves.toEqual({
      ok: false,
      message: 'bad_amount',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mints a token then creates the payment, and returns the gateway URL', async () => {
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const u = String(url);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: u, body: String(init?.body ?? ''), auth: headers.Authorization ?? '' });
      if (u.endsWith('/Api/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'AT', token_type: 'Bearer', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ payment_token: { token: 'PTOK' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const r = await createMoncashOrder({ orderId: 'order-42', amountHtg: 1188 });
    expect(r).toEqual({
      ok: true,
      provider: 'direct',
      mode: 'sandbox',
      // Digicel verifies by the id WE chose, so our own reference is what gets
      // persisted — unlike Bazik, which mints its own.
      providerRef: 'order-42',
      redirectUrl:
        'https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=PTOK',
    });

    expect(calls[0].url).toBe('https://sandbox.moncashbutton.digicelgroup.com/Api/oauth/token');
    expect(calls[0].body).toBe('scope=read,write&grant_type=client_credentials');
    expect(calls[0].auth).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);

    expect(calls[1].url).toBe('https://sandbox.moncashbutton.digicelgroup.com/Api/v1/CreatePayment');
    expect(JSON.parse(calls[1].body)).toEqual({ amount: 1188, orderId: 'order-42' });
    expect(calls[1].auth).toBe('Bearer AT');
  });

  it('reuses the cached bearer within its 59-second life instead of re-authenticating', async () => {
    let oauthCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/Api/oauth/token')) {
        oauthCalls++;
        // 59s is what MonCash really returns (verified against their sandbox).
        // With a 60s safety window this test would fail — every token would be
        // born expired and every call would re-authenticate.
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 59 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ payment_token: { token: 'T' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await createMoncashOrder({ orderId: 'a', amountHtg: 100 });
    await createMoncashOrder({ orderId: 'b', amountHtg: 100 });
    expect(oauthCalls).toBe(1);
  });

  it('resolves a failure (never throws) when MonCash errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/Api/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('gateway down', { status: 502 });
    });
    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('502');
  });

  it('resolves a failure when the credentials are rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    const r = await createMoncashOrder({ orderId: 'o', amountHtg: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('401');
  });
});

describe('retrieveMoncashOrder', () => {
  beforeEach(() => {
    process.env.MONCASH_CLIENT_ID = 'id';
    process.env.MONCASH_CLIENT_SECRET = 'secret';
  });

  it('maps a successful retrieval', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/Api/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          payment: {
            reference: 'order-42',
            transaction_id: '1234',
            cost: 1188,
            message: 'successful',
            payer: '509xxxxxxx',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const r = await retrieveMoncashOrder('order-42');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paid).toBe(true);
      expect(r.transactionId).toBe('1234');
      expect(r.amountHtg).toBe(1188);
      expect(r.payer).toBe('509xxxxxxx');
    }
  });

  it('reports paid=false for an unpaid order rather than failing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/Api/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ payment: { reference: 'o', message: 'pending' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const r = await retrieveMoncashOrder('o');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.paid).toBe(false);
  });
});
