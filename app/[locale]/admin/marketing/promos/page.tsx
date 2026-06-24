import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconPlus, IconChevronRight, IconInfinity } from '@tabler/icons-react';
import { getPromoCodes } from '@/lib/admin/data';
import { parsePromoQuery } from '@/lib/admin/marketing-query';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { MarketingTabs } from '@/components/admin/marketing/MarketingTabs';
import { PromoFilters } from '@/components/admin/marketing/PromoFilters';
import { PromoRowActions } from '@/components/admin/marketing/PromoRowActions';
import { PromoStatusBadge, discountLabel } from '@/components/admin/marketing/ui';
import { Link } from '@/i18n/routing';
import { courses } from '@/data/courses';
import { fmtDate, fmtInt } from '@/lib/admin/format';
import type { RawSearchParams } from '@/lib/admin/users-query';

export const dynamic = 'force-dynamic';

const courseBySlug = new Map(courses.map((c) => [c.slug, c]));

export default async function PromosPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('users.act'))) return <Forbidden />;
  const t = await getTranslations('admin.marketing.promos');
  const rows = await getPromoCodes(parsePromoQuery(searchParams));

  const appliesLabel = (a: string, slug: string | null) => {
    if (a === 'course' && slug) {
      const c = courseBySlug.get(slug);
      return c ? (locale === 'ht' ? c.title_ht : c.title_fr) : t('applies.course');
    }
    return t(`applies.${a}`);
  };

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MarketingTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        <Link
          href="/admin/marketing/promos/nouveau"
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-paper-light hover:bg-ink/90"
        >
          <IconPlus size={14} /> {t('createCta')}
        </Link>
      </div>

      <PromoFilters />

      <div className="overflow-x-auto rounded-xl border border-ink/12 bg-paper-light">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
              <th className="px-3 py-2">{t('col.code')}</th>
              <th className="px-3 py-2">{t('col.discount')}</th>
              <th className="px-3 py-2">{t('col.applies')}</th>
              <th className="px-3 py-2 text-right">{t('col.usage')}</th>
              <th className="px-3 py-2">{t('col.expiry')}</th>
              <th className="px-3 py-2">{t('col.status')}</th>
              <th className="px-3 py-2 text-right">{t('col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center font-mono text-xs text-graphite/55">
                  {t('empty')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink/8 last:border-0 hover:bg-ink/[0.02]">
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/marketing/promos/${r.code}`}
                    className="inline-flex items-center gap-1 font-mono text-[13px] font-semibold text-ink hover:text-ochre"
                  >
                    {r.code} <IconChevronRight size={13} className="text-ink/30" />
                  </Link>
                </td>
                <td className="px-3 py-2.5 font-mono text-[13px] tabular-nums text-ink/85">
                  {discountLabel(r.discountType, r.discountValue)}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-ink/75">{appliesLabel(r.appliesTo, r.courseSlug)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink/85">
                  <span className="inline-flex items-center gap-1">
                    {fmtInt(r.usedCount)}
                    <span className="text-ink/35">/</span>
                    {r.maxUses == null ? <IconInfinity size={13} className="text-ink/40" /> : fmtInt(r.maxUses)}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-ink/65">
                  {r.expiresAt ? fmtDate(r.expiresAt, locale) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <PromoStatusBadge status={r.status} label={t(`status.${r.status}`)} />
                </td>
                <td className="px-3 py-2.5">
                  <PromoRowActions id={r.id} code={r.code} isActive={r.isActive} deletable={r.usedCount === 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
