import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { IconLock, IconShieldCheck, IconCircleCheck, IconClock } from '@tabler/icons-react';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { SmartImage } from '@/components/ui/SmartImage';
import { CourseSlideshow } from '@/components/courses/CourseSlideshow';
import { courseMainImage, siteImages } from '@/lib/courseImage';
import { getPublishedCourseBySlug } from '@/lib/courses/source';
import { formatUsd, formatHtg } from '@/lib/money';
import { usdCentsToHtg } from '@/lib/payments/moncash';
import { getFxRate } from '@/lib/fx';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { courseTitle } from '@/lib/courseFields';
import { PaymentMethods } from '@/components/checkout/PaymentMethods';
import { PromoCodeField } from '@/components/checkout/PromoCodeField';
import { CheckoutPromoProvider } from '@/components/checkout/promo-context';
import { activeProviders as toggledProviderKeys } from '@/lib/admin/platform/store';
import { activeProviderLabels, splitProviders, checkoutProviders, moncashSandboxNotice, PROVIDER_LABELS } from '@/lib/payments/providers';
import { checkoutMode } from '@/lib/payments/checkout-target';
import { resolveProduct } from '@/lib/payments/products';
import { getPublicTeacher } from '@/lib/teacher/public';
import { hasCourseAccess, hasSubscriptionConflict } from '@/lib/learner/access';
import { clerkEnabled } from '@/lib/clerk';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Peman — PNICE Academy' };

// Dynamic so admin provider toggles take effect on checkout immediately.
export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('checkout');
  const tc = await getTranslations('common');

  const courseSlug =
    typeof searchParams.course === 'string' ? searchParams.course : undefined;
  const teacherSlug =
    typeof searchParams.teacher === 'string' ? searchParams.teacher : undefined;
  const course = courseSlug ? await getPublishedCourseBySlug(courseSlug) : undefined;

  // Stage: checkout honesty — an unknown/unpublished `?course=` slug is a
  // 404, NEVER a silent morph into a subscription checkout (see
  // lib/payments/checkout-target.ts; mirrors the teacher-slug branch below).
  const mode = checkoutMode({ courseRequested: Boolean(courseSlug), courseResolved: Boolean(course) });
  if (mode === 'not_found') notFound();
  const isSub = mode === 'subscription';

  // Task: per-teacher subscription checkout — the AMOUNT charged always
  // comes from `resolveProduct`, the exact same resolver `/api/checkout`
  // uses to create the Stripe session, so this page can never show a price
  // it wouldn't actually charge. `teacherSlug` selects a specific teacher's
  // plan; omitted/unresolvable-teacher falls back to the platform default —
  // an unresolvable NAMED teacher (unknown slug, or no active plan to sell)
  // 404s rather than silently charging the wrong amount.
  const subProduct = isSub
    ? await resolveProduct({ productType: 'subscription', teacherSlug: teacherSlug ?? null })
    : null;
  if (isSub && !subProduct) notFound();

  // Display-only: the teacher's localized public name/seal, resolved
  // separately from the charge amount (lib/teacher/public.ts's
  // `getPublicTeacher`) — kept apart from `resolveProduct` on purpose so a
  // cosmetic lookup can never affect what gets charged.
  const teacherForDisplay = isSub && teacherSlug ? await getPublicTeacher(teacherSlug, locale) : null;

  const amountUsd = isSub ? subProduct!.amountCents / 100 : course!.priceUsd;
  const itemName = isSub
    ? teacherForDisplay
      ? t('subItemTeacher', { name: teacherForDisplay.displayName })
      : t('subItem')
    : courseTitle(course!, locale);
  const itemSub = isSub ? t('subPer') : t('unitLabel');
  // Task: two subscription products — make the SCOPE of a subscription
  // purchase unambiguous right on the order summary: the platform-wide
  // "Pass PNICE" covers every course; a named teacher's pass covers only
  // that teacher's own courses. `null` for a one-off course purchase.
  const scopeNote = isSub
    ? teacherForDisplay
      ? t('subTeacherOnlyNote', { name: teacherForDisplay.displayName })
      : t('subAllCoursesNote')
    : null;
  const sealCode = isSub ? teacherForDisplay?.initials ?? 'PA' : course!.code;
  const perLabel = isSub ? tc('perMonth') : '';

  // Repurchase guard (Stage: checkout honesty): a signed-in user who ALREADY
  // has what this page sells gets a friendly "Ou gen aksè deja" state instead
  // of a pay button — /api/checkout re-checks server-side as the backstop.
  // Env-gated: signed out / Clerk mock / no DB ⇒ both checks resolve false
  // and the page behaves exactly as before.
  const clerkId = clerkEnabled ? (await auth()).userId : null;
  const alreadyHasAccess = clerkId
    ? isSub
      ? await hasSubscriptionConflict(clerkId, {
          kind: subProduct!.kind ?? 'platform',
          teacherPlanId: subProduct!.teacherPlanId,
          teacherUserId: subProduct!.teacherUserId,
        })
      : await hasCourseAccess(clerkId, course!.slug)
    : false;

  // Which rails may checkout SELL vs merely ANNOUNCE — both derive from the
  // ONE payment-truth source (lib/payments/providers.ts): the "we accept"
  // badges are the live rails' labels, the method selector gets ONLY live
  // rails, and toggled-but-unbuilt rails become quiet "Byento" chips.
  const acceptedBadges = await activeProviderLabels();
  // True while MonCash is offered through Digicel's SANDBOX — a simulator that
  // reports success for money that never moved. A buyer must never be asked to
  // pay through that without being told, so the page says so plainly.
  const moncashIsTest = moncashSandboxNotice();

  // The SELECTOR uses checkoutProviders(), which may include a sandbox MonCash
  // the owner deliberately enabled for testing. The "we accept" badges above
  // deliberately do NOT — a rail that cannot actually take money must never be
  // advertised as accepted, whatever the selector is currently offering.
  const { live, comingSoon } = splitProviders(await toggledProviderKeys(), await checkoutProviders());
  const liveMethods = live.map((k) => ({ id: k, label: PROVIDER_LABELS[k] }));
  const comingSoonMethods = comingSoon.map((k) => ({ id: k, label: PROVIDER_LABELS[k] }));

  // THE EXACT DEBIT, not an estimate. Everywhere else on the site a gourde
  // figure is a conversion of the real (USD) price and carries a "~" to say
  // so. Here it stops being an estimate: both Haitian wallets charge in
  // gourdes, and this is the very number the checkout route will send to the
  // gateway — `usdCentsToHtg` at the same live rate, so the summary and the
  // debit cannot disagree. One line serves either rail because both compute
  // the identical figure. Courses only: neither wallet can renew a
  // subscription (those routes return `subscription_unsupported`).
  const walletIsLive = !isSub && (live.includes('moncash') || live.includes('natcash'));
  const walletExactHtg = walletIsLive
    ? formatHtg(usdCentsToHtg(Math.round(amountUsd * 100), await getFxRate()))
    : null;

  return (
    <Section>
      <Container className="max-w-4xl">
        <h1 className="font-display text-4xl font-black text-ink md:text-5xl">
          {t('title')}
        </h1>

        <CheckoutPromoProvider>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            {/* Order summary */}
            <div className="rounded-2xl border border-ink/15 bg-paper p-7">
              <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-ink/50">
                {t('summary')}
              </h2>

              {course && (
                <div className="relative mt-5 aspect-[16/9] overflow-hidden rounded-xl border border-ink/10 bg-paper-light">
                  <SmartImage
                    src={courseMainImage(course.images, course.code)}
                    alt={itemName}
                    fill
                    sizes="(max-width: 768px) 100vw, 480px"
                    className="object-cover"
                  />
                </div>
              )}

              <div className="mt-5 flex items-start gap-4">
                <Sceau size="sm" tone="ochre" rotate={-6} className="shrink-0">
                  <span className="font-display text-sm font-black leading-none">
                    {sealCode}
                  </span>
                </Sceau>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold leading-tight text-ink">
                    {itemName}
                  </p>
                  <p className="mt-1 font-mono text-xs text-graphite/60">
                    {itemSub}
                  </p>
                  {scopeNote && (
                    <p className="mt-1.5 text-xs leading-snug text-teal">
                      {scopeNote}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 border-t border-ink/10 pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm uppercase tracking-wide text-ink/60">
                    {t('total')}
                  </span>
                  <div className="text-right">
                    <Price
                      usd={amountUsd}
                      className="font-display text-3xl font-black text-ink"
                    />
                    <span className="font-mono text-sm text-graphite/60">
                      {perLabel}
                    </span>
                  </div>
                </div>
                {walletExactHtg ? (
                  <>
                    <p className="mt-1 text-right font-mono text-xs text-graphite/70">
                      {walletExactHtg}
                    </p>
                    <p className="mt-0.5 text-right font-mono text-[10px] leading-snug text-graphite/50">
                      {live.includes('moncash') ? t('moncashExactNote') : t('natcashExactNote')}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-right font-mono text-xs text-graphite/55">
                    <PriceSecondary usd={amountUsd} />
                    {perLabel}
                  </p>
                )}
              </div>

              {/* Nothing to pay when access already exists — no promo field. */}
              {!alreadyHasAccess && (
                <PromoCodeField
                  productType={isSub ? 'subscription' : 'course'}
                  courseSlug={course?.slug ?? null}
                  grossCents={Math.round(amountUsd * 100)}
                  productKind={isSub ? subProduct!.kind : null}
                />
              )}
            </div>

            {/* Payment methods — or the friendly already-owned state. */}
            <div>
              {alreadyHasAccess ? (
                <div className="rounded-2xl border border-teal/30 bg-paper p-7">
                  <p className="flex items-center gap-2 font-display text-xl font-bold text-ink">
                    <IconCircleCheck size={24} className="shrink-0 text-teal" />
                    {t('owned.title')}
                  </p>
                  <p className="mt-3 text-[15px] leading-relaxed text-graphite/80">
                    {isSub ? t('owned.bodySub') : t('owned.bodyCourse')}
                  </p>
                  <Link
                    href="/tableau-de-bord"
                    className={buttonClasses('primary', 'lg', 'mt-6 w-full')}
                  >
                    {t('owned.cta')}
                  </Link>
                </div>
              ) : isSub && !live.includes('card') ? (
                // SUBSCRIPTIONS NEED A CARD, AND CARD IS NOT LIVE YET (owner's
                // wallets-first launch, août 2026). The wallets cannot renew
                // anything, so offering them here would only collect a tap and
                // answer "refused" — instead the page says the honest thing:
                // passes arrive with card payment, and courses can be bought
                // à l'unité with MonCash/NatCash today. This block deletes
                // itself: the moment a LIVE Stripe key lands, `cardSellable()`
                // puts 'card' back in `live` and the selector returns.
                <div className="rounded-2xl border border-ochre/40 bg-paper p-7">
                  <p className="flex items-center gap-2 font-display text-xl font-bold text-ink">
                    <IconClock size={24} className="shrink-0 text-ochre" />
                    {t('subSoon.title')}
                  </p>
                  <p className="mt-3 text-[15px] leading-relaxed text-graphite/80">
                    {t('subSoon.body')}
                  </p>
                  <Link
                    href="/formations"
                    className={buttonClasses('primary', 'lg', 'mt-6 w-full')}
                  >
                    {t('subSoon.cta')}
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl border border-ink/15 bg-paper p-7">
                  {moncashIsTest && (
                    <p
                      role="status"
                      className="mb-5 rounded border border-stampred/45 bg-stampred/[0.07] px-3.5 py-3 text-[13px] leading-snug text-stampred"
                    >
                      {t('moncashTestNotice')}
                    </p>
                  )}
                  <PaymentMethods
                    // The BUTTON itself speaks both currencies (owner ask):
                    // USD is the reference price, but the wallets debit
                    // gourdes — the figure on the very control that commits
                    // the buyer must show what leaves their account.
                    payLabel={`${t('pay')} ${formatUsd(amountUsd)}${walletExactHtg ? ` · ${walletExactHtg}` : ''}`}
                    methods={liveMethods}
                    comingSoon={comingSoonMethods}
                    productType={isSub ? 'subscription' : 'course'}
                    courseSlug={course ? course.slug : null}
                    teacherSlug={isSub ? teacherSlug ?? null : null}
                  />
                </div>
              )}

              {/* trust signals — kept separate from PaymentMethods so its
                  fetch/redirect logic (C1-P1) stays untouched. */}
              <div className="mt-5 rounded-xl border border-ink/10 bg-paper-light/70 p-5">
                <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink/60">
                  <IconLock size={13} className="shrink-0" />
                  {t('trust.lock')}
                </p>
                <p className="mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed text-graphite/70">
                  <IconShieldCheck size={15} className="mt-0.5 shrink-0 text-teal" />
                  {t('trust.guarantee')}
                </p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/45">
                  {t('trust.accepted')}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {acceptedBadges.map((p) => (
                    <li
                      key={p}
                      className="rounded border border-ink/15 px-2.5 py-1 font-mono text-[11px] text-ink/60"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </CheckoutPromoProvider>

        {/* trust band */}
        <div className="relative mt-10 aspect-[3/1] overflow-hidden rounded-2xl bg-ink sm:aspect-[4/1]">
          <CourseSlideshow
            images={siteImages('secure')}
            alt={t('secure')}
            sizes="(max-width: 1120px) 100vw, 896px"
          />
          <div className="absolute inset-0 bg-ink/55" />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-2xl font-black text-paper-light md:text-3xl">
              {t('secure')}
            </p>
            {/* Same ONE payment-truth source as the badges above — never a
                hardcoded rail list (Stage: checkout honesty). */}
            <p className="mt-1.5 font-mono text-[11px] tracking-wide text-paper-light/70">
              {acceptedBadges.join(' · ')}
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
