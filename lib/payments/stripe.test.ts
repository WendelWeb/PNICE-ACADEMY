import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stripeFormEncode, createStripeCheckout } from '@/lib/payments/stripe';
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
    };

    await createStripeCheckout({ ...baseInput, mode: 'payment', product });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.has('metadata[teacherPlanId]')).toBe(false);
    expect(body.has('metadata[teacherUserId]')).toBe(false);
    expect(body.has('subscription_data[metadata][teacherPlanId]')).toBe(false);
  });

  it('omits teacher metadata for the platform-default subscription (no specific plan resolved)', async () => {
    const product: ResolvedProduct = {
      productType: 'subscription',
      courseSlug: null,
      nameHt: 'Abònman chak mwa PNICE Academy',
      nameFr: 'Abonnement mensuel PNICE Academy',
      amountCents: 7900,
      teacherPlanId: null,
      teacherUserId: null,
    };

    await createStripeCheckout({ ...baseInput, mode: 'subscription', product });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.has('metadata[teacherPlanId]')).toBe(false);
    expect(body.has('subscription_data[metadata][teacherPlanId]')).toBe(false);
    // userDbId is still always present, unaffected by the teacher fields.
    expect(body.get('subscription_data[metadata][userDbId]')).toBe('user-1');
  });
});
