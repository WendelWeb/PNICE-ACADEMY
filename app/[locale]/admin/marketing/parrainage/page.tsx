import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconUsersGroup, IconChevronRight } from '@tabler/icons-react';
import { getReferrers, getReferrerDetail, getReferralCreditCents } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { MarketingTabs } from '@/components/admin/marketing/MarketingTabs';
import { ReferralCreditPanel } from '@/components/admin/marketing/ReferralCreditPanel';
import { cn } from '@/lib/cn';
import { Link } from '@/i18n/routing';
import { fmtUsdCents, fmtInt, fmtDate } from '@/lib/admin/format';
import type { ReferralSortKey } from '@/lib/admin/data';
import type { RawSearchParams } from '@/lib/admin/users-query';

export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ParrainagePage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('users.act'))) return <Forbidden />;
  const t = await getTranslations('admin.marketing.referrals');

  const sort: ReferralSortKey = one(searchParams.sort) === 'credits' ? 'credits' : 'converted';
  const ref = one(searchParams.ref);
  const [referrers, creditCents, detail] = await Promise.all([
    getReferrers(sort),
    getReferralCreditCents(),
    ref ? getReferrerDetail(ref) : Promise.resolve(null),
  ]);

  const sortLink = (key: ReferralSortKey) => `/admin/marketing/parrainage?sort=${key}`;

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MarketingTabs />
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <ReferralCreditPanel currentUsd={creditCents / 100} canEdit />

      {/* sort control */}
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span className="text-ink/45">{t('sortBy')}</span>
        {(['converted', 'credits'] as ReferralSortKey[]).map((k) => (
          <Link
            key={k}
            href={sortLink(k)}
            className={cn(
              'rounded-lg border px-2.5 py-1 uppercase tracking-wide',
              sort === k ? 'border-ochre bg-ochre/15 text-ink' : 'border-ink/15 text-ink/60 hover:bg-ink/[0.04]',
            )}
          >
            {t(`sort.${k}`)}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink/12 bg-paper-light">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
              <th className="px-3 py-2">{t('col.referrer')}</th>
              <th className="px-3 py-2">{t('col.code')}</th>
              <th className="px-3 py-2 text-right">{t('col.invited')}</th>
              <th className="px-3 py-2 text-right">{t('col.converted')}</th>
              <th className="px-3 py-2 text-right">{t('col.credits')}</th>
              <th className="px-3 py-2 text-right">{t('col.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {referrers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center font-mono text-xs text-graphite/55">{t('empty')}</td>
              </tr>
            )}
            {referrers.map((r) => (
              <tr key={r.userId} className={cn('border-b border-ink/8 last:border-0 hover:bg-ink/[0.02]', ref === r.userId && 'bg-ochre/[0.06]')}>
                <td className="px-3 py-2.5">
                  <Link href={`/admin/utilisateurs/${r.userId}`} className="text-[13px] text-ink hover:text-ochre">
                    {r.userName}
                  </Link>
                  <span className="block font-mono text-[10px] text-ink/45">{r.userEmail}</span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-ink/70">{r.referralCode}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink/85">{fmtInt(r.invited)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-teal">{fmtInt(r.converted)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">{fmtUsdCents(r.creditsCents)}</td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    href={`/admin/marketing/parrainage?sort=${sort}&ref=${r.userId}`}
                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink/55 hover:text-ochre"
                  >
                    {t('view')} <IconChevronRight size={12} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Referrer detail (Task 8) */}
      {detail && (
        <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
          <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
            <IconUsersGroup size={13} /> {t('detail.title', { name: detail.referrer.userName })}
          </h2>
          <p className="mt-1 font-mono text-[11px] text-ink/55">
            {t('detail.summary', { invited: detail.referrer.invited, converted: detail.referrer.converted })} ·{' '}
            {fmtUsdCents(detail.referrer.creditsCents)}
          </p>
          <ul className="mt-3 space-y-1.5">
            {detail.filleuls.map((f, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper px-3 py-2">
                <span className="text-[13px] text-ink/85">
                  {f.userId ? (
                    <Link href={`/admin/utilisateurs/${f.userId}`} className="hover:text-ochre">{f.userName}</Link>
                  ) : (
                    <span className="text-ink/45">{t('detail.notSignedUp')}</span>
                  )}
                </span>
                <span className="flex items-center gap-3 font-mono text-[10px]">
                  <span className="text-ink/45">{fmtDate(f.createdAt, locale)}</span>
                  {f.status === 'confirmed' ? (
                    <span className="rounded bg-teal/15 px-1.5 py-0.5 uppercase tracking-wide text-teal">
                      {t('filleulStatus.confirmed')} · {fmtDate(f.confirmedAt, locale)}
                    </span>
                  ) : (
                    <span className="rounded bg-ochre/15 px-1.5 py-0.5 uppercase tracking-wide text-ochre">{t('filleulStatus.pending')}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
