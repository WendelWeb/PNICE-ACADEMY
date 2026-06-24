import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  IconArrowLeft,
  IconTag,
  IconReceipt2,
  IconCalendarOff,
  IconUsers,
} from '@tabler/icons-react';
import { getPromoDetail, getUsers } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { MarketingTabs } from '@/components/admin/marketing/MarketingTabs';
import { PromoRowActions } from '@/components/admin/marketing/PromoRowActions';
import { SimulateRedemption } from '@/components/admin/marketing/SimulateRedemption';
import { PromoStatusBadge, discountLabel } from '@/components/admin/marketing/ui';
import { KpiCard, MockNote } from '@/components/admin/ui';
import { Link } from '@/i18n/routing';
import { courses } from '@/data/courses';
import { fmtUsdCents, fmtDate, fmtDateTime, fmtInt } from '@/lib/admin/format';

export const dynamic = 'force-dynamic';

const courseBySlug = new Map(courses.map((c) => [c.slug, c]));

export default async function PromoDetailPage({
  params: { locale, code },
}: {
  params: { locale: 'ht' | 'fr'; code: string };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('users.act'))) return <Forbidden />;
  const t = await getTranslations('admin.marketing.promos');

  const detail = await getPromoDetail(decodeURIComponent(code));
  if (!detail) notFound();
  const { promo, redemptions, revenueGeneratedCents, revenueUndiscountedCents, discountGivenCents } = detail;

  const sample = (await getUsers({ pageSize: 10 })).rows.map((u) => ({ id: u.id, name: u.name }));

  const appliesLabel = () => {
    if (promo.appliesTo === 'course' && promo.courseSlug) {
      const c = courseBySlug.get(promo.courseSlug);
      return c ? (locale === 'ht' ? c.title_ht : c.title_fr) : t('applies.course');
    }
    return t(`applies.${promo.appliesTo}`);
  };

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <MarketingTabs />
      <Link href="/admin/marketing/promos" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
        <IconArrowLeft size={14} /> {t('backToList')}
      </Link>

      {/* header */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ink/12 bg-paper-light p-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-ink/8 text-ink/60">
          <IconTag size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="font-mono text-xl font-bold tracking-wide text-ink">{promo.code}</h1>
          <p className="mt-0.5 font-mono text-xs text-ink/55">
            {discountLabel(promo.discountType, promo.discountValue)} · {appliesLabel()}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PromoStatusBadge status={promo.status} label={t(`status.${promo.status}`)} />
          <PromoRowActions id={promo.id} code={promo.code} isActive={promo.isActive} deletable={promo.usedCount === 0} />
        </div>
      </div>

      {/* meta */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('detail.usage')} value={`${fmtInt(promo.usedCount)} / ${promo.maxUses == null ? '∞' : fmtInt(promo.maxUses)}`} />
        <KpiCard label={t('detail.generated')} value={fmtUsdCents(revenueGeneratedCents)} tone="teal" secondary={t('detail.collected')} />
        <KpiCard label={t('detail.undiscounted')} value={fmtUsdCents(revenueUndiscountedCents)} secondary={t('detail.atFullPrice')} />
        <KpiCard label={t('detail.discountGiven')} value={fmtUsdCents(discountGivenCents)} tone="ochre" />
      </div>
      <MockNote>{t('detail.indicativeNote')}</MockNote>

      {/* meta line: expiry / created */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-ink/12 bg-paper-light p-4 font-mono text-[11px] text-ink/60">
        <span className="flex items-center gap-1.5"><IconCalendarOff size={13} /> {t('detail.expires')}: {promo.expiresAt ? fmtDate(promo.expiresAt, locale) : t('create.unlimited')}</span>
        {promo.startsAt && <span className="flex items-center gap-1.5">{t('detail.starts')}: {fmtDate(promo.startsAt, locale)}</span>}
        <span>{t('detail.created')}: {fmtDate(promo.createdAt, locale)}</span>
      </div>

      {/* redemptions */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconUsers size={13} /> {t('detail.redemptions')} ({redemptions.length})
        </h2>
        {redemptions.length === 0 ? (
          <p className="mt-3 font-mono text-xs text-graphite/55">{t('detail.noRedemptions')}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
                  <th className="px-2 py-1.5">{t('detail.user')}</th>
                  <th className="px-2 py-1.5">{t('detail.date')}</th>
                  <th className="px-2 py-1.5">{t('detail.payment')}</th>
                  <th className="px-2 py-1.5 text-right">{t('detail.gross')}</th>
                  <th className="px-2 py-1.5 text-right">{t('detail.discount')}</th>
                  <th className="px-2 py-1.5 text-right">{t('detail.net')}</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.id} className="border-b border-ink/8 last:border-0">
                    <td className="px-2 py-2">
                      <Link href={`/admin/utilisateurs/${r.userId}`} className="text-[13px] text-ink hover:text-ochre">
                        {r.userName}
                      </Link>
                      <span className="block font-mono text-[10px] text-ink/45">{r.userEmail}</span>
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] text-ink/65 tabular-nums">{fmtDateTime(r.redeemedAt, locale)}</td>
                    <td className="px-2 py-2 font-mono text-[11px] text-ink/55">
                      {r.paymentId ?? <span className="rounded bg-ochre/12 px-1.5 py-0.5 text-ochre">{t('detail.simulated')}</span>}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[12px] tabular-nums text-ink/65">{fmtUsdCents(r.grossCents)}</td>
                    <td className="px-2 py-2 text-right font-mono text-[12px] tabular-nums text-ochre">−{fmtUsdCents(r.discountCents)}</td>
                    <td className="px-2 py-2 text-right font-mono text-[13px] font-semibold tabular-nums text-ink">{fmtUsdCents(r.netCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* mock testing aid (Task 10) — only meaningful while active */}
      {promo.status === 'active' && <SimulateRedemption code={promo.code} sampleUsers={sample} />}
    </div>
  );
}
