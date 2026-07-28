/**
 * Dedicated "Taux de change" admin page (Task fix/fx-rate-unify, owner
 * request): the USD→HTG display rate used to be an edit form buried inside
 * /admin/plateforme (with a read-only link from /admin/transactions) — easy
 * to miss. This page is the single obvious place to view + edit it.
 *
 * Gated the same way /admin/plateforme is: that page checks
 * `resolveAdminRole(me) === 'super-admin'` directly; nav.ts's 'platform' item
 * gates on the 'roles.manage' capability, which only the super-admin role
 * has in lib/admin/permissions's matrix — so `hasCap('roles.manage')` here
 * is the equivalent, capability-based form of that same restriction.
 */
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconCurrencyDollar, IconAlertTriangle } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { getFxRate } from '@/lib/fx';
import { getAuditLog } from '@/lib/admin/data';
import { fmtDateTime } from '@/lib/admin/format';
import { Forbidden } from '@/components/admin/Forbidden';
import { FxRatePanel } from '@/components/admin/tx/FxRatePanel';

export const dynamic = 'force-dynamic';
const DAY = 86_400_000;

export default async function FxRatePage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('roles.manage'))) return <Forbidden />;

  const t = await getTranslations('admin.taux');
  const rate = await getFxRate();
  const lastFx = await getAuditLog({ action: 'set_fx_rate', pageSize: 1 });
  const lastFxAdmin = lastFx.rows[0]?.adminName ?? null;
  // Same reasoning as /admin/plateforme: platform_settings.updatedAt is
  // shared by every setting on the singleton row, not just FX — the audit
  // log's own set_fx_rate entries are the accurate per-setting timestamp.
  const updatedAt = lastFx.rows[0]?.createdAt ?? null;
  const fxStale = !updatedAt || Date.now() - Date.parse(updatedAt) > 7 * DAY;

  return (
    <div className="mx-auto max-w-[720px] space-y-4">
      <div>
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        <p className="mt-2 rounded-lg bg-teal/[0.06] px-3 py-2 text-[13px] leading-relaxed text-ink/80">
          {t('explain')}
        </p>
      </div>

      {fxStale && (
        <p className="flex items-center gap-1.5 rounded-lg bg-ochre/[0.08] px-3 py-2 font-mono text-[11px] text-ochre">
          <IconAlertTriangle size={14} /> {t('fxStale')}
        </p>
      )}

      <FxRatePanel rate={rate} updatedAt={updatedAt} canEdit locale={locale} />

      <p className="font-mono text-[10px] text-ink/45">
        <IconCurrencyDollar size={11} className="inline" />{' '}
        {lastFxAdmin ? t('fxLastBy', { name: lastFxAdmin }) : t('fxNeverEdited')} · {fmtDateTime(updatedAt, locale)}
      </p>
    </div>
  );
}
