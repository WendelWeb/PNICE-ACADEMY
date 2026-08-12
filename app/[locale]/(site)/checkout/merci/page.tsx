import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconMail } from '@tabler/icons-react';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { Stamp } from '@/components/ui/Stamp';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { formatUsd } from '@/lib/money';
import { getCourseBySlug } from '@/lib/courses/source';
import {
  stripeConfigured,
  getStripeCheckoutSession,
  type StripeSessionSummary,
} from '@/lib/payments/stripe';

export const metadata: Metadata = { title: 'Mèsi — PNICE Academy' };

// Reads the buyer's own Stripe session — never prerendered/cached.
export const dynamic = 'force-dynamic';

export default async function MerciPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('merci');

  // Stage: checkout honesty — /api/checkout appends
  // ?session_id={CHECKOUT_SESSION_ID} to the success URL, so this page can
  // read back (server-side, env-gated, never-throw) what was REALLY bought:
  // item, amount, reference. A direct visit with no/bad session id — or no
  // Stripe key — degrades to the generic confirmation exactly as before.
  const sessionId =
    typeof searchParams.session_id === 'string' ? searchParams.session_id : undefined;
  let purchase: StripeSessionSummary | null = null;
  if (sessionId && stripeConfigured()) {
    const s = await getStripeCheckoutSession(sessionId);
    // Only show details for a session Stripe confirms is actually settled.
    if (s && (s.paymentStatus === 'paid' || s.paymentStatus === 'no_payment_required')) {
      purchase = s;
    }
  }

  // A MonCash purchase arrives here from /api/payments/moncash/retour, which
  // has ALREADY verified the payment with Digicel and granted access — it
  // carries `?moncash=1&course=<slug>` instead of a Stripe session id. Nothing
  // is re-verified here (that would be a second, slower round trip to prove
  // something already proved); this only decides which course to name.
  const paidWithMoncash = searchParams.moncash === '1';
  const moncashCourseSlug =
    typeof searchParams.course === 'string' ? searchParams.course : undefined;
  const moncashCourse =
    paidWithMoncash && moncashCourseSlug ? await getCourseBySlug(moncashCourseSlug) : null;
  const moncashItemName = moncashCourse
    ? (locale === 'fr' ? moncashCourse.title_fr : moncashCourse.title_ht) || moncashCourse.title_ht
    : null;

  // Real, uneventful confirmation date — shown alongside the real Stripe
  // reference when we have one; still no fabricated order number when the
  // page has no session to read.
  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  return (
    <Section>
      <Container className="max-w-lg text-center">
        {/* the stamp reprise — a receipt-style document, the same seal
            gesture as the hero manifest and the teacher page (PART A3/A4) */}
        <div className="mx-auto max-w-sm rounded-2xl border border-ink/15 bg-paper px-7 pb-8 pt-6 shadow-[0_28px_56px_-28px_rgba(16,32,74,0.35)]">
          <header
            aria-hidden="true"
            className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-ink/45"
          >
            <span>{t('docHeader')}</span>
            <span>{dateLabel}</span>
          </header>
          <div aria-hidden="true">
            <div className="mt-2 border-t-2 border-ink/80" />
            <div className="mt-[3px] border-t border-ink/25" />
          </div>

          <div className="mt-7 flex justify-center">
            <Stamp immediate rotate={-8}>
              <Sceau size="lg" rotate={0} tone="ochre">
                <span className="font-display text-2xl font-black leading-none tracking-wide">
                  ✓ {t('sealWord')}
                </span>
              </Sceau>
            </Stamp>
          </div>

          <h1 className="mt-7 font-display text-3xl font-black leading-tight text-ink md:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-graphite/80">
            {t('body')}
          </p>

          {purchase && (
            <dl className="mt-6 space-y-2.5 border-t border-ink/10 pt-5 text-left">
              {purchase.itemName && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
                    {t('purchased')}
                  </dt>
                  <dd className="text-right text-sm font-medium leading-snug text-ink">
                    {purchase.itemName}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
                  {t('amount')}
                </dt>
                <dd className="text-right font-display text-lg font-black text-ink tabular-nums">
                  {formatUsd(purchase.amountCents / 100)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
                  {t('reference')}
                </dt>
                <dd className="break-all text-right font-mono text-[11px] text-graphite/70">
                  {purchase.reference}
                </dd>
              </div>
            </dl>
          )}

          {/* MonCash: the amount and reference live on Digicel's side, and the
              return URL carries neither. Naming the course is both honest and
              the only thing the buyer actually needs to see confirmed. */}
          {paidWithMoncash && moncashItemName && (
            <dl className="mt-6 space-y-2.5 border-t border-ink/10 pt-5 text-left">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
                  {t('purchased')}
                </dt>
                <dd className="text-right text-sm font-medium leading-snug text-ink">
                  {moncashItemName}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
                  {t('method')}
                </dt>
                <dd className="text-right text-sm font-medium text-ink">MonCash</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="mt-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-ink/45">
            {t('nextSteps')}
          </p>
          <Link
            href="/tableau-de-bord"
            className={buttonClasses('primary', 'lg', 'mt-4 inline-flex')}
          >
            {t('cta')}
          </Link>
          <p className="mt-4 flex items-center justify-center gap-1.5 font-mono text-[11px] text-graphite/55">
            <IconMail size={14} className="shrink-0" />
            {t('emailNote')}
          </p>
        </div>
      </Container>
    </Section>
  );
}
