/**
 * Dedicated "Pri Pass PNICE" (Pass PNICE price) admin page — Task: two
 * subscription products. Copied from app/[locale]/admin/taux/page.tsx (the
 * same layout, the same capability gate, the same audit-log "last edited by"
 * strip) since this is the same kind of owner-only, DB-backed platform
 * setting the FX-rate page introduced its own dedicated page for.
 *
 * Gated the same way /admin/taux is: `hasCap('roles.manage')` — the
 * platform-wide all-access price is owner-level, not a regular admin
 * setting (same nav cap as 'taux'/'platform'/'roles'/'audit').
 */
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconReceipt2, IconAlertTriangle } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { getPlatformPassPriceCents } from '@/lib/platformPrice';
import { isPlatformPassEnabled } from '@/lib/admin/platform/store';
import { getAuditLog } from '@/lib/admin/data';
import { fmtDateTime } from '@/lib/admin/format';
import { Forbidden } from '@/components/admin/Forbidden';
import { PlatformPricePanel } from '@/components/admin/tx/PlatformPricePanel';

export const dynamic = 'force-dynamic';
const DAY = 86_400_000;

export default async function PlatformPassPricePage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('roles.manage'))) return <Forbidden />;

  const t = await getTranslations('admin.prix');
  const priceCents = await getPlatformPassPriceCents();
  const passEnabled = await isPlatformPassEnabled();
  const lastEdit = await getAuditLog({ action: 'set_platform_pass_price', pageSize: 1 });
  const lastEditAdmin = lastEdit.rows[0]?.adminName ?? null;
  // Same reasoning as /admin/taux: platform_settings.updatedAt is shared by
  // every setting on the singleton row, not just this one — the audit log's
  // own set_platform_pass_price entries are the accurate per-setting
  // timestamp.
  const updatedAt = lastEdit.rows[0]?.createdAt ?? null;
  const priceStale = !updatedAt || Date.now() - Date.parse(updatedAt) > 180 * DAY;

  return (
    <div className="mx-auto max-w-[720px] space-y-4">
      <div>
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        <p className="mt-2 rounded-lg bg-teal/[0.06] px-3 py-2 text-[13px] leading-relaxed text-ink/80">
          {t('explain')}
        </p>
      </div>

      {priceStale && (
        <p className="flex items-center gap-1.5 rounded-lg bg-ochre/[0.08] px-3 py-2 font-mono text-[11px] text-ochre">
          <IconAlertTriangle size={14} /> {t('neverReviewed')}
        </p>
      )}

      <PlatformPricePanel priceUsd={priceCents / 100} updatedAt={updatedAt} canEdit locale={locale} passEnabled={passEnabled} />

      <p className="font-mono text-[10px] text-ink/45">
        <IconReceipt2 size={11} className="inline" />{' '}
        {lastEditAdmin ? t('lastBy', { name: lastEditAdmin }) : t('neverEdited')} · {fmtDateTime(updatedAt, locale)}
      </p>
    </div>
  );
}
