import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { IconLock, IconShieldCheck } from '@tabler/icons-react';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { SmartImage } from '@/components/ui/SmartImage';
import { CourseSlideshow } from '@/components/courses/CourseSlideshow';
import { courseImageSrc, siteImages } from '@/lib/courseImage';
import { getPublishedCourseBySlug } from '@/lib/courses/source';
import { formatUsd } from '@/lib/money';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { courseTitle } from '@/lib/courseFields';
import { PaymentMethods } from '@/components/checkout/PaymentMethods';
import { PromoCodeField } from '@/components/checkout/PromoCodeField';
import { activeProviders } from '@/lib/admin/platform/store';
import { resolveProduct } from '@/lib/payments/products';
import { getPublicTeacher } from '@/lib/teacher/public';

export const metadata: Metadata = { title: 'Peman — PNICE Academy' };

// Map provider keys to display labels for trust badges.
const PROVIDER_LABELS: Record<string, string> = {
  card: 'Visa',
  paypal: 'PayPal',
  moncash: 'MonCash',
  natcash: 'NatCash',
  crypto: 'Crypto',
};

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
  const isSub = !course;

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

  // Derive accepted payment badges from active providers.
  const acceptedBadges = activeProviders()
    .map((k) => PROVIDER_LABELS[k])
    .filter(Boolean);

  return (
    <Section>
      <Container className="max-w-4xl">
        <h1 className="font-display text-4xl font-black text-ink md:text-5xl">
          {t('title')}
        </h1>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {/* Order summary */}
          <div className="rounded-2xl border border-ink/15 bg-paper p-7">
            <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-ink/50">
              {t('summary')}
            </h2>

            {course && (
              <div className="relative mt-5 aspect-[16/9] overflow-hidden rounded-xl border border-ink/10 bg-paper-light">
                <SmartImage
                  src={courseImageSrc(course.code)}
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
              <p className="mt-1 text-right font-mono text-xs text-graphite/55">
                <PriceSecondary usd={amountUsd} />
                {perLabel}
              </p>
            </div>

            <PromoCodeField
              productType={isSub ? 'subscription' : 'course'}
              courseSlug={course?.slug ?? null}
              grossCents={Math.round(amountUsd * 100)}
            />
          </div>

          {/* Payment methods */}
          <div>
            <div className="rounded-2xl border border-ink/15 bg-paper p-7">
              <PaymentMethods
                payLabel={`${t('pay')} ${formatUsd(amountUsd)}`}
                active={activeProviders()}
                productType={isSub ? 'subscription' : 'course'}
                courseSlug={course ? course.slug : null}
                teacherSlug={isSub ? teacherSlug ?? null : null}
              />
            </div>

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
            <p className="mt-1.5 font-mono text-[11px] tracking-wide text-paper-light/70">
              {t('secureSub')}
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
