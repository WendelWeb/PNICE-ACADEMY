import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stripeFormEncode, createStripeCheckout, getStripeCheckoutSessionStatus } from '@/lib/payments/stripe';
import type { ResolvedProduct } from '@/lib/payments/products';

describe('stripeFormEncode', () => {
  it('encodes bracketed keys and skips null/undefined', () => {
    const s = stripeFormEncode({
      mode: 'payment',
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][unit_amount]': 900,
      skipMe: undefined,
      alsoSkip: null,
    });
    expect(s).toContain('mode=payment');
    expect(s).toContain(encodeURIComponent('line_items[0][quantity]') + '=1');
    expect(s).toContain(encodeURIComponent('line_items[0][price_data][unit_amount]') + '=900');
    expect(s).not.toContain('skipMe');
    expect(s).not.toContain('alsoSkip');
  });

  it('URL-encodes values', () => {
    expect(stripeFormEncode({ name: 'Zouti & kat' })).toBe('name=Zouti+%26+kat');
  });
});

// Task: per-teacher subscription checkout — `createStripeCheckout` must
// carry `teacherPlanId`/`teacherUserId` into Stripe metadata (both the
// checkout session AND `subscription_data`, mirroring the existing
// `userDbId` pattern) so lib/payments/fulfill.ts + lib/teacher/earnings.ts
// can credit the RIGHT teacher instead of guessing. Stubs global `fetch` +
// a fake STRIPE_SECRET_KEY (restored after each test) to inspect the exact
// request body without hitting the network.
describe('createStripeCheckout — teacher metadata (Task: per-teacher subscription checkout)', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/cs_test_1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  const baseInput = {
    userDbId: 'user-1',
    checkoutRowId: 'row-1',
    customerEmail: 'x@y.com',
    locale: 'ht' as const,
    successUrl: 'https://x.test/merci',
    cancelUrl: 'https://x.test/checkout',
  };

  it('puts teacherPlanId + teacherUserId on both the session and subscription_data metadata', async () => {
    const product: ResolvedProduct = {
      productType: 'subscription',
      courseSlug: null,
      nameHt: 'Abònman chak mwa — Pwofesè Live',
      nameFr: 'Abonnement mensuel — Pwofesè Live',
      amountCents: 3000,
      teacherPlanId: 'plan-123',
      teacherUserId: 'owner-456',
      kind: 'teacher',
    };

    await createStripeCheckout({ ...baseInput, mode: 'subscription', product });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('metadata[teacherPlanId]')).toBe('plan-123');
    expect(body.get('metadata[teacherUserId]')).toBe('owner-456');
    expect(body.get('subscription_data[metadata][teacherPlanId]')).toBe('plan-123');
    expect(body.get('subscription_data[metadata][teacherUserId]')).toBe('owner-456');
  });

  it('omits teacher metadata entirely for a course purchase', async () => {
    const product: ResolvedProduct = {
      productType: 'course',
      courseSlug: 'zouti-finansye-dijital',
      nameHt: 'Fòmasyon',
      nameFr: 'Formation',
      amountCents: 900,
      teacherPlanId: null,
      teacherUserId: null,
      kind: null,
    };

    await createStripeCheckout({ ...baseInput, mode: 'payment', product });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.has('metadata[teacherPlanId]')).toBe(false);
    expect(body.has('metadata[teacherUserId]')).toBe(false);
    expect(body.has('subscription_data[metadata][teacherPlanId]')).toBe(false);
    expect(body.has('metadata[kind]')).toBe(false);
  });

  it('omits teacher metadata for the platform-default subscription (no specific plan resolved)', async () => {
    const product: ResolvedProduct = {
      productType: 'subscription',
      courseSlug: null,
      nameHt: 'Pass PNICE — tout kou yo',
      nameFr: 'Pass PNICE — toutes les formations',
      amountCents: 7900,
      teacherPlanId: null,
      teacherUserId: null,
      kind: 'platform',
    };

    await createStripeCheckout({ ...baseInput, mode: 'subscription', product });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.has('metadata[teacherPlanId]')).toBe(false);
    expect(body.has('subscription_data[metadata][teacherPlanId]')).toBe(false);
    // userDbId is still always present, unaffected by the teacher fields.
    expect(body.get('subscription_data[metadata][userDbId]')).toBe('user-1');
  });

  // Task: two subscription products — `kind` metadata is what
  // lib/payments/fulfill.ts uses to tag the local `subscriptions` row.
  describe('kind metadata (Task: two subscription products)', () => {
    it('puts kind=platform on both session and subscription_data metadata', async () => {
      const product: ResolvedProduct = {
        productType: 'subscription',
        courseSlug: null,
        nameHt: 'Pass PNICE — tout kou yo',
        nameFr: 'Pass PNICE — toutes les formations',
        amountCents: 7900,
        teacherPlanId: null,
        teacherUserId: null,
        kind: 'platform',
      };
      await createStripeCheckout({ ...baseInput, mode: 'subscription', product });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = new URLSearchParams(init.body as string);
      expect(body.get('metadata[kind]')).toBe('platform');
      expect(body.get('subscription_data[metadata][kind]')).toBe('platform');
    });

    it('puts kind=teacher on both session and subscription_data metadata', async () => {
      const product: ResolvedProduct = {
        productType: 'subscription',
        courseSlug: null,
        nameHt: 'Abònman chak mwa — Pwofesè Live',
        nameFr: 'Abonnement mensuel — Pwofesè Live',
        amountCents: 3000,
        teacherPlanId: 'plan-123',
        teacherUserId: 'owner-456',
        kind: 'teacher',
      };
      await createStripeCheckout({ ...baseInput, mode: 'subscription', product });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = new URLSearchParams(init.body as string);
      expect(body.get('metadata[kind]')).toBe('teacher');
      expect(body.get('subscription_data[metadata][kind]')).toBe('teacher');
    });

    it('omits kind metadata for a course purchase', async () => {
      const product: ResolvedProduct = {
        productType: 'course',
        courseSlug: 'zouti-finansye-dijital',
        nameHt: 'Fòmasyon',
        nameFr: 'Formation',
        amountCents: 900,
        teacherPlanId: null,
        teacherUserId: null,
        kind: null,
      };
      await createStripeCheckout({ ...baseInput, mode: 'payment', product });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = new URLSearchParams(init.body as string);
      expect(body.has('metadata[kind]')).toBe(false);
    });
  });
});

// Launch review fix: a promo discount on a SUBSCRIPTION checkout used to be
// baked straight into the recurring `price_data.unit_amount` — discounting
// every future renewal forever, not just the first charge. Pins the fix:
// subscription mode always creates the recurring Price at the FULL price and
// applies the discount as a freshly-minted `duration: 'once'` Coupon; a
// one-off course purchase keeps subtracting the discount directly, same as
// always.
describe('createStripeCheckout — promo discount (launch review fix)', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    fetchMock = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/coupons')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'coupon_once_1' }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/cs_test_1' }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  const baseInput = {
    userDbId: 'user-1',
    checkoutRowId: 'row-1',
    customerEmail: 'x@y.com',
    locale: 'ht' as const,
    successUrl: 'https://x.test/merci',
    cancelUrl: 'https://x.test/checkout',
  };

  const subProduct: ResolvedProduct = {
    productType: 'subscription',
    courseSlug: null,
    nameHt: 'Pass PNICE — tout kou yo',
    nameFr: 'Pass PNICE — toutes les formations',
    amountCents: 7900,
    teacherPlanId: null,
    teacherUserId: null,
    kind: 'platform',
  };

  const courseProduct: ResolvedProduct = {
    productType: 'course',
    courseSlug: 'zouti-finansye-dijital',
    nameHt: 'Fòmasyon',
    nameFr: 'Formation',
    amountCents: 900,
    teacherPlanId: null,
    teacherUserId: null,
    kind: null,
  };

  it('a subscription with a discount creates the recurring Price at the FULL amount, discount via a once-coupon', async () => {
    await createStripeCheckout({
      ...baseInput,
      mode: 'subscription',
      product: subProduct,
      discountCents: 1580, // 20% off 7900
      promoCode: 'LANSMAN20',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [couponUrl, couponInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(couponUrl).toContain('/coupons');
    const couponBody = new URLSearchParams(couponInit.body as string);
    expect(couponBody.get('amount_off')).toBe('1580');
    expect(couponBody.get('duration')).toBe('once');
    expect(couponBody.get('max_redemptions')).toBe('1');

    const [, sessionInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const sessionBody = new URLSearchParams(sessionInit.body as string);
    // FULL price, never the discounted amount — so every renewal bills full.
    expect(sessionBody.get('line_items[0][price_data][unit_amount]')).toBe('7900');
    expect(sessionBody.get('discounts[0][coupon]')).toBe('coupon_once_1');
  });

  it('a subscription with NO discount never calls the coupon endpoint', async () => {
    await createStripeCheckout({ ...baseInput, mode: 'subscription', product: subProduct });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, sessionInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sessionBody = new URLSearchParams(sessionInit.body as string);
    expect(sessionBody.get('line_items[0][price_data][unit_amount]')).toBe('7900');
    expect(sessionBody.has('discounts[0][coupon]')).toBe(false);
  });

  it('a one-off course purchase still subtracts the discount straight from unit_amount — no coupon', async () => {
    await createStripeCheckout({
      ...baseInput,
      mode: 'payment',
      product: courseProduct,
      discountCents: 100,
      promoCode: 'TEN',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no coupon round-trip
    const [, sessionInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sessionBody = new URLSearchParams(sessionInit.body as string);
    expect(sessionBody.get('line_items[0][price_data][unit_amount]')).toBe('800');
    expect(sessionBody.has('discounts[0][coupon]')).toBe(false);
  });

  it('propagates a coupon-creation failure as the overall error, without still creating a session', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, json: async () => ({ error: { message: 'coupon boom' } }) }),
    );
    const result = await createStripeCheckout({
      ...baseInput,
      mode: 'subscription',
      product: subProduct,
      discountCents: 1580,
      promoCode: 'LANSMAN20',
    });
    expect(result).toEqual({ error: 'coupon boom' });
    expect(fetchMock).toHaveBeenCalledTimes(1); // never reached /checkout/sessions
  });
});

describe('getStripeCheckoutSessionStatus (launch review fix — pending-checkout guard)', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('returns status + url for a live open session', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'open', url: 'https://checkout.stripe.com/cs_live_1' }),
    });
    const s = await getStripeCheckoutSessionStatus('cs_live_1234567');
    expect(s).toEqual({ status: 'open', url: 'https://checkout.stripe.com/cs_live_1' });
  });

  it('returns complete/expired with no url', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'complete', url: null }) });
    expect(await getStripeCheckoutSessionStatus('cs_live_1234567')).toEqual({ status: 'complete', url: null });
  });

  it('degrades to unknown on a malformed id, without calling fetch', async () => {
    expect(await getStripeCheckoutSessionStatus('not-a-session-id')).toEqual({ status: 'unknown', url: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to unknown on an API failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: 'nope' } }) });
    expect(await getStripeCheckoutSessionStatus('cs_live_1234567')).toEqual({ status: 'unknown', url: null });
  });
});
