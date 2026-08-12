import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  moncashConfigured,
  moncashMode,
  moncashHost,
  moncashBasicAuth,
  normalizeHaitianMsisdn,
  isMoncashPaid,
  isMoncashPending,
  usdCentsToHtg,
  initiateMoncashPayment,
  checkMoncashPaymentByReference,
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

/** Mocks the OAuth call; every other request gets `body`. */
function mockMoncash(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/MerChantApi/oauth/token')) {
      return new Response(JSON.stringify({ access_token: 'AT', token_type: 'bearer', expires_in: 59 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('gating', () => {
  it('needs BOTH credentials', () => {
    expect(moncashConfigured()).toBe(false);
    process.env.MONCASH_CLIENT_ID = 'id';
    expect(moncashConfigured()).toBe(false);
    process.env.MONCASH_CLIENT_SECRET = 'secret';
    expect(moncashConfigured()).toBe(true);
  });

  it('resolves not_configured instead of throwing', async () => {
    await expect(
      initiateMoncashPayment({ reference: 'r', account: '50938662809', amountHtg: 90 }),
    ).resolves.toEqual({ ok: false, message: 'not_configured' });
    await expect(checkMoncashPaymentByReference('r')).resolves.toEqual({
      ok: false,
      message: 'not_configured',
    });
  });
});

describe('mode', () => {
  it('defaults to sandbox; only MONCASH_MODE=live switches hosts', () => {
    expect(moncashMode()).toBe('sandbox');
    expect(moncashHost()).toBe('sandbox.moncashbutton.digicelgroup.com');
    process.env.MONCASH_MODE = 'LIVE';
    expect(moncashHost()).toBe('moncashbutton.digicelgroup.com');
    process.env.MONCASH_MODE = 'production';
    expect(moncashMode()).toBe('sandbox');
  });
});

describe('moncashBasicAuth', () => {
  it('base64-encodes id:secret', () => {
    expect(moncashBasicAuth('user', 'pass')).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
  });
});

describe('normalizeHaitianMsisdn', () => {
  it('accepts every way a Haitian writes their own number', () => {
    for (const input of [
      '38662809',
      '3866 2809',
      '38-66-28-09',
      '50938662809',
      '+509 38662809',
      '+509 3866-2809',
      '00509 38662809',
      '0509 38662809',
      ' 509 3866 2809 ',
    ]) {
      expect(normalizeHaitianMsisdn(input), input).toBe('50938662809');
    }
  });

  it('handles all four mobile prefix families', () => {
    expect(normalizeHaitianMsisdn('28662809')).toBe('50928662809');
    expect(normalizeHaitianMsisdn('48662809')).toBe('50948662809');
    expect(normalizeHaitianMsisdn('58662809')).toBe('50958662809');
  });

  it('rejects what cannot be a Haitian mobile', () => {
    expect(normalizeHaitianMsisdn('')).toBeNull();
    expect(normalizeHaitianMsisdn('abc')).toBeNull();
    expect(normalizeHaitianMsisdn('3866280')).toBeNull(); // 7 digits
    expect(normalizeHaitianMsisdn('386628099')).toBeNull(); // 9 digits
    expect(normalizeHaitianMsisdn('18662809')).toBeNull(); // bad prefix
    expect(normalizeHaitianMsisdn('98662809')).toBeNull();
    expect(normalizeHaitianMsisdn('+1 202 555 0100')).toBeNull();
  });
});

describe('isMoncashPaid / isMoncashPending', () => {
  it('treats only "successful" as paid', () => {
    expect(isMoncashPaid({ message: 'successful' })).toBe(true);
    expect(isMoncashPaid({ message: 'SUCCESSFUL' })).toBe(true);
    expect(isMoncashPaid({ message: ' successful ' })).toBe(true);
    expect(isMoncashPaid({ message: 'pending' })).toBe(false);
    expect(isMoncashPaid({ message: 'failed' })).toBe(false);
    expect(isMoncashPaid({})).toBe(false);
    expect(isMoncashPaid(null)).toBe(false);
    expect(isMoncashPaid('successful')).toBe(false);
  });

  it('recognises the waiting-on-the-buyer states', () => {
    expect(isMoncashPending({ message: 'pending' })).toBe(true);
    expect(isMoncashPending({ message: 'created' })).toBe(true);
    expect(isMoncashPending({ message: 'successful' })).toBe(false);
    expect(isMoncashPending({ message: 'failed' })).toBe(false);
  });
});

describe('usdCentsToHtg', () => {
  it('converts at the given rate, whole gourdes', () => {
    expect(usdCentsToHtg(900, 132)).toBe(1188);
    expect(usdCentsToHtg(4900, 132)).toBe(6468);
    expect(usdCentsToHtg(100, 132.5)).toBe(133);
  });

  it('never makes a paid course free', () => {
    expect(usdCentsToHtg(1, 0.4)).toBe(1);
  });

  it('refuses nonsense instead of guessing', () => {
    expect(usdCentsToHtg(0, 132)).toBe(0);
    expect(usdCentsToHtg(-900, 132)).toBe(0);
    expect(usdCentsToHtg(900, 0)).toBe(0);
    expect(usdCentsToHtg(Number.NaN, 132)).toBe(0);
    expect(usdCentsToHtg(900, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('initiateMoncashPayment', () => {
  beforeEach(() => {
    process.env.MONCASH_CLIENT_ID = 'id';
    process.env.MONCASH_CLIENT_SECRET = 'secret';
  });

  it('validates before spending a network call', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(
      initiateMoncashPayment({ reference: '', account: '50938662809', amountHtg: 90 }),
    ).resolves.toEqual({ ok: false, message: 'bad_reference' });
    await expect(
      initiateMoncashPayment({ reference: 'r', account: '38662809', amountHtg: 90 }),
    ).resolves.toEqual({ ok: false, message: 'bad_account' });
    await expect(
      initiateMoncashPayment({ reference: 'r', account: '50938662809', amountHtg: 0 }),
    ).resolves.toEqual({ ok: false, message: 'bad_amount' });
    await expect(
      initiateMoncashPayment({ reference: 'r', account: '50938662809', amountHtg: 12.5 }),
    ).resolves.toEqual({ ok: false, message: 'bad_amount' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('authenticates then pushes the cash-out request', async () => {
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: String(url), body: String(init?.body ?? ''), auth: headers.Authorization ?? '' });
      if (String(url).endsWith('/MerChantApi/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 59 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ mode: 'sandbox', reference: 'order-42', message: 'pending', transactionId: null }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    });

    const r = await initiateMoncashPayment({
      reference: 'order-42',
      account: '50938662809',
      amountHtg: 1188,
    });
    expect(r).toEqual({ ok: true, reference: 'order-42', transactionId: null, message: 'pending' });

    expect(calls[0].url).toBe('https://sandbox.moncashbutton.digicelgroup.com/MerChantApi/oauth/token');
    expect(calls[0].body).toBe('scope=read,write&grant_type=client_credentials');
    expect(calls[0].auth).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);

    expect(calls[1].url).toBe(
      'https://sandbox.moncashbutton.digicelgroup.com/MerChantApi/V1/InitiatePayment',
    );
    expect(JSON.parse(calls[1].body)).toEqual({
      reference: 'order-42',
      account: '50938662809',
      amount: 1188,
    });
    expect(calls[1].auth).toBe('Bearer AT');
  });

  it('treats 201 Created as success, not an error', async () => {
    mockMoncash({ reference: 'r', message: 'pending' }, 201);
    const r = await initiateMoncashPayment({ reference: 'r', account: '50938662809', amountHtg: 90 });
    expect(r.ok).toBe(true);
  });

  it('resolves a failure (never throws) when MonCash errors', async () => {
    mockMoncash('gateway down', 502);
    const r = await initiateMoncashPayment({ reference: 'r', account: '50938662809', amountHtg: 90 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('502');
  });
});

describe('token cache', () => {
  beforeEach(() => {
    process.env.MONCASH_CLIENT_ID = 'id';
    process.env.MONCASH_CLIENT_SECRET = 'secret';
  });

  it('reuses the bearer within its 59-second life instead of re-authenticating', async () => {
    let oauth = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/MerChantApi/oauth/token')) {
        oauth++;
        return new Response(JSON.stringify({ access_token: 'AT', expires_in: 59 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ message: 'pending', reference: 'r' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await initiateMoncashPayment({ reference: 'a', account: '50938662809', amountHtg: 90 });
    await checkMoncashPaymentByReference('a');
    await checkMoncashPaymentByReference('a');
    // Without a safety window sized for a 59s token this would be 3.
    expect(oauth).toBe(1);
  });
});

describe('checkMoncashPaymentByReference', () => {
  beforeEach(() => {
    process.env.MONCASH_CLIENT_ID = 'id';
    process.env.MONCASH_CLIENT_SECRET = 'secret';
  });

  it('maps a successful payment', async () => {
    mockMoncash({
      reference: '336216631',
      amount: 190,
      message: 'successful',
      transactionId: '2171920428',
      account: '50938662809',
    });
    const r = await checkMoncashPaymentByReference('336216631');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paid).toBe(true);
      expect(r.pending).toBe(false);
      expect(r.transactionId).toBe('2171920428');
      expect(r.amountHtg).toBe(190);
      expect(r.account).toBe('50938662809');
    }
  });

  it('reports pending while the buyer has not approved', async () => {
    mockMoncash({ reference: 'r', message: 'pending', transactionId: null });
    const r = await checkMoncashPaymentByReference('r');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paid).toBe(false);
      expect(r.pending).toBe(true);
    }
  });

  it('reports neither paid nor pending on a declined payment', async () => {
    mockMoncash({ reference: 'r', message: 'failed' });
    const r = await checkMoncashPaymentByReference('r');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paid).toBe(false);
      expect(r.pending).toBe(false);
    }
  });
});
