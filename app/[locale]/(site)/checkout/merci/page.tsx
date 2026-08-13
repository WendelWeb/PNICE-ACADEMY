import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconMail, IconClockHour4 } from '@tabler/icons-react';
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
  // Either Haitian wallet lands here the same way — the return route appends
  // its own flag, and from this page's point of view the two are identical:
  // a gourde purchase whose amount and reference live on the gateway's side.
  const paidWithMoncash = searchParams.moncash === '1';
  const paidWithNatcash = searchParams.natcash === '1';
  const paidWithWallet = paidWithMoncash || paidWithNatcash;
  const walletName = paidWithNatcash ? 'NatCash' : 'MonCash';
  const moncashCourseSlug =
    typeof searchParams.course === 'string' ? searchParams.course : undefined;
  const moncashCourse =
    paidWithWallet && moncashCourseSlug ? await getCourseBySlug(moncashCourseSlug) : null;
  const moncashItemName = moncashCourse
    ? (locale === 'fr' ? moncashCourse.title_fr : moncashCourse.title_ht) || moncashCourse.title_ht
    : null;

  // PENDING VERIFICATION. `/api/payments/moncash/retour` sends the buyer here
  // with `?pending=1&order=…` when it could not get a definitive answer out of
  // the provider — the money has very likely left their wallet, but we cannot
  // yet prove it, so we must not claim the purchase succeeded.
  //
  // Before this state existed those buyers were dropped on an empty dashboard
  // telling them they owned nothing, seconds after paying. Now the page says
  // what is actually happening, shows the reference they can quote to support,
  // and offers one tap back to the callback that settles it. The
  // reconciliation cron closes it out even if they never tap.
  const pendingOrderId =
    paidWithWallet && searchParams.pending === '1' && typeof searchParams.order === 'string'
      ? searchParams.order
      : null;

  // Real, uneventful confirmation date — shown alongside the real Stripe
  // reference when we have one; still no fabricated order number when the
  // page has no session to read.
  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  if (pendingOrderId) {
    // Deliberately NOT the celebratory seal: nothing is confirmed yet, and a
    // stamped "✓ PEYE" over an unverified payment would be the one lie this
    // page must never tell.
    return (
      <Section>
        <Container className="max-w-lg text-center">
          <div className="mx-auto max-w-sm rounded-2xl border border-ochre/40 bg-paper px-7 pb-8 pt-6 shadow-[0_28px_56px_-28px_rgba(16,32,74,0.35)]">
            <header
              aria-hidden="true"
              className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-ink/45"
            >
              <span>{t('docHeader')}</span>
              <span>{dateLabel}</span>
            </header>
            <div aria-hidden="true">
              <div className="mt-2 border-t-2 border-ochre/70" />
              <div className="mt-[3px] border-t border-ink/25" />
            </div>

            <div className="mt-7 flex justify-center">
              <IconClockHour4 size={44} className="text-ochre" aria-hidden="true" />
            </div>

            <h1 className="mt-5 font-display text-2xl font-black leading-tight text-ink md:text-3xl">
              {t('pending.title')}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-graphite/80">
              {t('pending.body', { wallet: walletName })}
            </p>

            <dl className="mt-6 space-y-2.5 border-t border-ink/10 pt-5 text-left">
              {moncashItemName && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
                    {t('purchased')}
                  </dt>
                  <dd className="text-right text-sm font-medium leading-snug text-ink">
                    {moncashItemName}
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
                  {t('reference')}
                </dt>
                <dd className="break-all text-right font-mono text-[11px] text-graphite/70">
                  {pendingOrderId}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-8">
            {/* Straight back to the callback that settles the order — the same
                URL the gateway itself calls, so one tap is a real
                re-verification, not a page reload that re-renders this same
                message. It must be the rail the buyer actually used: asking
                MonCash about a NatCash order gets a confident "never heard of
                it". */}
            <a
              href={`/api/payments/${paidWithNatcash ? 'natcash' : 'moncash'}/retour?orderId=${encodeURIComponent(pendingOrderId)}`}
              className={buttonClasses('primary', 'lg', 'inline-flex')}
            >
              {t('pending.recheck')}
            </a>
            <p className="mt-4 text-sm leading-relaxed text-graphite/70">
              {t('pending.reassure')}
            </p>
            <p className="mt-4 font-mono text-[11px] text-graphite/55">
              <Link href="/tableau-de-bord" className="underline underline-offset-2 transition-colors hover:text-ochre">
                {t('cta')}
              </Link>
              {' · '}
              <Link href="/kontak" className="underline underline-offset-2 transition-colors hover:text-ochre">
                {t('pending.contact')}
              </Link>
            </p>
          </div>
        </Container>
      </Section>
    );
  }

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
          {paidWithWallet && moncashItemName && (
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
                <dd className="text-right text-sm font-medium text-ink">{walletName}</dd>
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
