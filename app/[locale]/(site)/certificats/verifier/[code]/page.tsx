import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconShieldCheck, IconBan, IconHelpCircle } from '@tabler/icons-react';
import { Section, Container } from '@/components/ui/Section';
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
      ? { bg: 'bg-teal/10', ring: 'border-teal/30', text: 'text-teal', Icon: IconShieldCheck }
      : state === 'revoked'
        ? { bg: 'bg-stampred/10', ring: 'border-stampred/30', text: 'text-stampred', Icon: IconBan }
        : { bg: 'bg-ink/5', ring: 'border-ink/15', text: 'text-ink/55', Icon: IconHelpCircle };

  return (
    <Section>
      <Container className="max-w-lg">
        <div className={cn('rounded-2xl border bg-paper-light p-7 text-center sm:p-9', tone.ring)}>
          <span className={cn('mx-auto grid h-16 w-16 place-items-center rounded-full', tone.bg)}>
            <tone.Icon size={32} className={tone.text} />
          </span>
          <h1 className={cn('mt-5 font-display text-2xl font-bold', tone.text)}>{t(`${state}.title`)}</h1>
          <p className="mt-2 text-sm leading-relaxed text-graphite/80">{t(`${state}.body`)}</p>

          {v.found && (
            <dl className="mt-6 space-y-3 border-t border-ink/10 pt-5 text-left">
              <Row label={t('name')} value={v.userName ?? '—'} />
              <Row label={t('course')} value={(locale === 'ht' ? v.courseTitle_ht : v.courseTitle_fr) ?? '—'} />
              <Row label={t('issued')} value={v.issuedAt ? new Date(v.issuedAt).toLocaleDateString(locale === 'ht' ? 'fr' : locale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—'} />
              <Row label={t('code')} value={v.code} mono />
            </dl>
          )}
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
