import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { Link } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Kont mwen — PNICE Academy' };

export default async function AccountPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <Section>
      <Container className="max-w-2xl">
        <h1 className="font-display text-4xl font-black text-ink md:text-5xl">
          {t('accountTitle')}
        </h1>

        <div className="mt-8 rounded-2xl border border-ink/12 bg-paper-light p-7">
          <div className="flex items-center gap-5">
            <Sceau size="md" tone="ochre" rotate={-6}>
              <span className="font-display text-2xl font-black leading-none">
                PA
              </span>
            </Sceau>
            <div>
              {/* DEMO profile */}
              <p className="font-display text-xl font-bold text-ink">
                Itilizatè demo
              </p>
              <p className="font-mono text-sm text-graphite/60">
                ou@imel.com
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-dashed border-ochre/50 bg-ochre/[0.06] px-4 py-3 font-mono text-[11px] leading-relaxed text-graphite/70">
            {t('soon')}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/tableau-de-bord" className={buttonClasses('dark', 'md')}>
              Tablo debò
            </Link>
            <Link href="/" className={buttonClasses('ghost', 'md')}>
              ←
            </Link>
          </div>
        </div>
      </Container>
    </Section>
  );
}
