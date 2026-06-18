import type { Metadata } from 'next';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { getCourse } from '@/data/courses';
import { subscription } from '@/data/pricing';
import { formatUsd, formatHtg, htgLabel } from '@/lib/money';
import { courseTitle } from '@/lib/courseFields';
import { PaymentMethods } from '@/components/checkout/PaymentMethods';

export const metadata: Metadata = { title: 'Peman — PNICE Academy' };

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
  const course = courseSlug ? getCourse(courseSlug) : undefined;
  const isSub = !course;

  const amountUsd = isSub ? subscription.usd : course!.priceUsd;
  const amountHtg = isSub ? subscription.htg : null;
  const itemName = isSub ? t('subItem') : courseTitle(course!, locale);
  const itemSub = isSub ? t('subPer') : t('unitLabel');
  const sealCode = isSub ? 'PA' : course!.code;
  const perLabel = isSub ? tc('perMonth') : '';

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
              </div>
            </div>

            <div className="mt-6 border-t border-ink/10 pt-5">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm uppercase tracking-wide text-ink/60">
                  {t('total')}
                </span>
                <div className="text-right">
                  <span className="font-display text-3xl font-black text-ink">
                    {formatUsd(amountUsd)}
                  </span>
                  <span className="font-mono text-sm text-graphite/60">
                    {perLabel}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-right font-mono text-xs text-graphite/55">
                ~{amountHtg ? formatHtg(amountHtg) : htgLabel(amountUsd)}
                {perLabel}
              </p>
            </div>
          </div>

          {/* Payment methods */}
          <PaymentMethods
            payLabel={`${t('pay')} ${formatUsd(amountUsd)}`}
          />
        </div>
      </Container>
    </Section>
  );
}
