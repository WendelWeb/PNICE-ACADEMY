import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconClockX } from '@tabler/icons-react';
import { Section, Container } from '@/components/ui/Section';
import { getReviewToken, isTokenValid } from '@/lib/admin/site/ops';
import { ReviewForm } from '@/components/site/ReviewForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Témoignage — PNICE Academy', robots: { index: false } };

export default async function SubmitReviewPage({
  params: { locale, token },
}: {
  params: { locale: 'ht' | 'fr'; token: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('review');
  const tok = getReviewToken(token);

  return (
    <Section>
      <Container className="max-w-lg">
        {isTokenValid(tok) ? (
          <ReviewForm token={token} name={tok!.userName} />
        ) : (
          <div className="rounded-2xl border border-ink/15 bg-paper-light p-8 text-center">
            <IconClockX size={34} className="mx-auto text-ink/45" />
            <h1 className="mt-4 font-display text-xl font-bold text-ink">{t('invalidTitle')}</h1>
            <p className="mt-2 text-sm text-graphite/75">{t('invalidBody')}</p>
          </div>
        )}
      </Container>
    </Section>
  );
}
