'use client';

/**
 * /kont — Sètifika tab (Stage: learner account). The learner's certificates
 * stop being a one-shot toast: every earned certificate is listed here
 * permanently — course, date, verification code, public verification link
 * and the PDF download (the same /api/certificate route the toast links to).
 */
import { useLocale, useTranslations } from 'next-intl';
import { IconCertificate, IconDownload, IconRosette } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import type { MyCertificate } from '@/lib/learner/account';
import { SettingsCard } from './ui';

function dateLabel(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function CertificatesTab({ certificates }: { certificates: MyCertificate[] }) {
  const t = useTranslations('kont.certificates');
  const locale = useLocale();

  return (
    <SettingsCard
      title={
        <span className="flex items-center gap-1.5">
          <IconCertificate size={14} /> {t('title')}
        </span>
      }
    >
      {certificates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <IconRosette size={28} className="text-ink/25" />
          <p className="max-w-xs text-sm leading-relaxed text-graphite/70">{t('empty')}</p>
          <Link href="/tableau-de-bord" className={cn(buttonClasses('ghost', 'md'), 'mt-1 text-xs')}>
            {t('emptyCta')}
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {certificates.map((c) => (
            <li key={c.code} className="rounded-xl border border-ink/12 bg-paper p-4 sm:p-5">
              <p className="font-display text-lg font-bold leading-tight text-ink">
                {locale === 'fr' ? c.titleFr : c.titleHt}
              </p>
              <p className="mt-1 font-mono text-[11px] text-ink/50">
                {t('issuedOn', { date: dateLabel(c.issuedAt) })}
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-ink/45">
                {t('codeLabel')}
              </p>
              <p className="font-mono text-base font-semibold tracking-wider text-ink">{c.code}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href={`/certificats/verifier/${c.code}`}
                  className={buttonClasses('ghost', 'sm')}
                >
                  {t('verifyLink')}
                </Link>
                <a
                  href={`/api/certificate/${encodeURIComponent(c.code)}?locale=${locale === 'fr' ? 'fr' : 'ht'}`}
                  className={buttonClasses('dark', 'sm')}
                >
                  <IconDownload size={14} />
                  {t('downloadPdf')}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
