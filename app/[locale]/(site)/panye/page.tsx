import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { CartView } from '@/components/cart/CartView';
import { activeProviders as toggledProviderKeys } from '@/lib/admin/platform/store';
import { splitProviders, checkoutProviders, PROVIDER_LABELS } from '@/lib/payments/providers';
import { getFxRate } from '@/lib/fx';
import { getPublishedCourses } from '@/lib/courses/source';
import { courseTitle } from '@/lib/courseFields';

export const metadata: Metadata = { title: 'Panye — PNICE Academy' };

// Dynamic: the offered methods follow the admin's provider toggles and the
// HTG line follows the live admin-set rate, immediately.
export const dynamic = 'force-dynamic';

/**
 * `/panye` — the cart. The page itself is a thin server shell: it resolves
 * the two things the client must never invent — WHICH rails may sell today
 * (the same payment-truth source as the checkout page) and the live USD→HTG
 * rate — and hands them to the client CartView, whose content lives in
 * localStorage. Only the wallets appear here: a basket is charged as ONE
 * wallet payment, and card is not live yet; when it is, it joins via the
 * same providers source with no change to this page.
 */
export default async function PanyePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('panye');

  const { live } = splitProviders(await toggledProviderKeys(), await checkoutProviders());
  // Wallets only — the basket endpoints are the wallet routes.
  const methods = live
    .filter((k) => k === 'moncash' || k === 'natcash')
    .map((k) => ({ id: k, label: PROVIDER_LABELS[k] }));
  const fxRateHtg = await getFxRate();

  // THE SERVER'S OWN CATALOGUE — current titles and prices for every
  // published course. The client cart holds display SNAPSHOTS taken at
  // add-to-cart time; a teacher may have moved a price since, and this page
  // presents the HTG line as the exact debit. CartView reconciles its
  // snapshots against this map on mount, so what the buyer approves is what
  // the checkout route will resolve — backed by the route's own
  // price_changed refusal as the server-side guarantee.
  const catalog = Object.fromEntries(
    (await getPublishedCourses()).map((c) => [
      c.slug,
      { title: courseTitle(c, locale), priceUsd: c.priceUsd },
    ]),
  );

  return (
    <Section>
      <Container className="max-w-5xl">
        <h1 className="font-display text-4xl font-black text-ink md:text-5xl">{t('title')}</h1>
        <CartView methods={methods} fxRateHtg={fxRateHtg} catalog={catalog} />
      </Container>
    </Section>
  );
}
