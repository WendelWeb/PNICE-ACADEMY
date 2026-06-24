import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { IconCurrencyDollar, IconAlertTriangle } from '@tabler/icons-react';
import { resolveAdminRole } from '@/lib/admin/access';
import { getPlatform } from '@/lib/admin/platform/store';
import { getFxRate } from '@/lib/admin/settings';
import { getAuditLog } from '@/lib/admin/data';
import { fmtDateTime } from '@/lib/admin/format';
import { Forbidden } from '@/components/admin/Forbidden';
import { FxRatePanel } from '@/components/admin/tx/FxRatePanel';
import { ProvidersPanel, SubscriptionPricePanel, MaintenancePanel } from '@/components/admin/platform/PlatformPanels';

export const dynamic = 'force-dynamic';
const DAY = 86_400_000;

export default async function PlatformPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  const { userId } = await auth();
  const client = await clerkClient();
  const me = userId ? await client.users.getUser(userId) : null;
  if (!me || resolveAdminRole(me) !== 'super-admin') return <Forbidden />;

  const t = await getTranslations('admin.platform');
  const platform = getPlatform();
  const { rate, updatedAt } = getFxRate();
  const fxStale = Date.now() - Date.parse(updatedAt) > 7 * DAY;
  const lastFx = await getAuditLog({ action: 'set_fx_rate', pageSize: 1 });
  const lastFxAdmin = lastFx.rows[0]?.adminName ?? null;

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <ProvidersPanel providers={platform.providers} />
      <SubscriptionPricePanel usd={platform.subscriptionUsd} />

      {/* FX — consolidated here (Transactions links to this) */}
      <div className="space-y-2">
        {fxStale && (
          <p className="flex items-center gap-1.5 rounded-lg bg-ochre/[0.08] px-3 py-2 font-mono text-[11px] text-ochre">
            <IconAlertTriangle size={14} /> {t('fxStale')}
          </p>
        )}
        <FxRatePanel rate={rate} updatedAt={updatedAt} canEdit locale={locale} />
        <p className="font-mono text-[10px] text-ink/45">
          <IconCurrencyDollar size={11} className="inline" /> {lastFxAdmin ? t('fxLastBy', { name: lastFxAdmin }) : t('fxNeverEdited')} · {fmtDateTime(updatedAt, locale)}
        </p>
      </div>

      <MaintenancePanel enabled={platform.maintenance.enabled} messageHt={platform.maintenance.message_ht} messageFr={platform.maintenance.message_fr} />
    </div>
  );
}
