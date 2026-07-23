import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconHelpCircle, IconDownload } from '@tabler/icons-react';
import { Section, Container } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';
import { Stamp } from '@/components/ui/Stamp';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import { getCertificateByCode } from '@/lib/admin/data';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vérification de certificat — PNICE Academy' };

export default async function VerifyCertificatePage({
  params: { locale, code },
}: {
  params: { locale: 'ht' | 'fr'; code: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('verify');
  const v = await getCertificateByCode(decodeURIComponent(code));

  const state = !v.found ? 'notfound' : v.revoked ? 'revoked' : 'valid';
  const tone =
    state === 'valid'
      ? { text: 'text-teal', ring: 'border-teal/30' }
      : state === 'revoked'
        ? { text: 'text-stampred', ring: 'border-stampred/30' }
        : { text: 'text-ink/55', ring: 'border-ink/15' };

  return (
    <Section>
      <Container className="max-w-lg">
        {/* the certificate renders as an actual bordered document — same
            kraft-card + mono-header recipe as the hero manifest and the
            merci receipt (PART A1/A3), so a verified certificate reads as
            an official paper, not a status banner. */}
        <div
          className={cn(
            'rounded-2xl border-2 bg-paper text-center shadow-[0_28px_56px_-28px_rgba(16,32,74,0.35)]',
            tone.ring,
          )}
        >
          <header className="flex items-center justify-between px-6 pb-3 pt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50 sm:px-8">
            <span>{t('docHeader')}</span>
            <span className="text-ink/35">{v.found ? v.code : '—'}</span>
          </header>
          <div aria-hidden="true" className="px-6 sm:px-8">
            <div className="border-t-2 border-ink/80" />
            <div className="mt-[3px] border-t border-ink/25" />
          </div>

          <div className="px-6 pb-8 pt-7 sm:px-8">
            {state === 'notfound' ? (
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ink/5">
                <IconHelpCircle size={30} className="text-ink/45" />
              </span>
            ) : (
              <div className="flex justify-center">
                <Stamp immediate rotate={state === 'valid' ? -8 : 7}>
                  <Sceau
                    size="lg"
                    rotate={0}
                    tone={state === 'revoked' ? 'red' : 'ink'}
                    className={cn(state === 'valid' && '!border-teal !text-teal')}
                  >
                    <span className="font-display text-xl font-black leading-none tracking-wide">
                      {state === 'valid' ? '✓' : '✕'}
                    </span>
                    <span className="mt-0.5 text-[10px] tracking-[0.16em]">
                      {t(`seal.${state}`)}
                    </span>
                  </Sceau>
                </Stamp>
              </div>
            )}

            <h1 className={cn('mt-6 font-display text-2xl font-bold', tone.text)}>
              {t(`${state}.title`)}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-graphite/80">
              {t(`${state}.body`)}
            </p>

            {v.found && (
              <dl className="mt-7 space-y-3 border-t border-ink/10 pt-6 text-left">
                <Row label={t('name')} value={v.userName ?? '—'} />
                <Row
                  label={t('course')}
                  value={(locale === 'ht' ? v.courseTitle_ht : v.courseTitle_fr) ?? '—'}
                />
                <Row
                  label={t('issued')}
                  value={
                    v.issuedAt
                      ? new Date(v.issuedAt).toLocaleDateString(locale === 'ht' ? 'fr' : locale, {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })
                      : '—'
                  }
                />
                <Row label={t('code')} value={v.code} mono />
              </dl>
            )}

            {state === 'valid' && (
              <div className="mt-7 flex justify-center">
                <a
                  href={`/api/certificate/${encodeURIComponent(v.code)}?locale=${locale}`}
                  className={cn(buttonClasses('dark', 'sm'))}
                >
                  <IconDownload size={16} />
                  {t('download')}
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/certificats/verifier"
            className="font-mono text-xs uppercase tracking-wide text-teal transition-colors hover:text-ochre"
          >
            {t('another')}
          </Link>
        </div>
      </Container>
    </Section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono text-[11px] uppercase tracking-wide text-ink/45">{label}</dt>
      <dd className={cn('text-sm text-ink', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
