import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { IconCurrencyDollar, IconAlertTriangle, IconArrowRight } from '@tabler/icons-react';
import { resolveAdminRole } from '@/lib/admin/access';
import { getPlatform } from '@/lib/admin/platform/store';
import { getFxRate } from '@/lib/fx';
import { getAuditLog } from '@/lib/admin/data';
import { fmtDateTime, fmtInt } from '@/lib/admin/format';
import { Forbidden } from '@/components/admin/Forbidden';
import { Link } from '@/i18n/routing';
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
  const rate = await getFxRate();
  const lastFx = await getAuditLog({ action: 'set_fx_rate', pageSize: 1 });
  const lastFxAdmin = lastFx.rows[0]?.adminName ?? null;
  // Task fix/fx-rate-unify: the rate itself is DB-backed now (lib/fx.ts),
  // which has no "last updated" column of its own worth trusting on its own
  // — platform_settings.updatedAt is shared by every setting on the same
  // singleton row (referral credit, subscription price, …), not just FX. The
  // audit log's own `set_fx_rate` entries are the accurate per-setting
  // timestamp; never edited ⇒ unknown provenance, treated as stale.
  const updatedAt = lastFx.rows[0]?.createdAt ?? null;
  const fxStale = !updatedAt || Date.now() - Date.parse(updatedAt) > 7 * DAY;

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <ProvidersPanel providers={platform.providers} />
      <SubscriptionPricePanel usd={platform.subscriptionUsd} />

      {/* FX — read-only here; editing moved to its own dedicated page
          (Task fix/fx-rate-unify, owner request: the edit form buried in
          this page was easy to miss). Transactions links to the same page. */}
      <div className="space-y-2">
        {fxStale && (
          <p className="flex items-center gap-1.5 rounded-lg bg-ochre/[0.08] px-3 py-2 font-mono text-[11px] text-ochre">
            <IconAlertTriangle size={14} /> {t('fxStale')}
          </p>
        )}
        <Link
          href="/admin/taux"
          className="flex items-center justify-between gap-2 rounded-xl border border-ink/12 bg-paper-light p-4 hover:border-ochre/40"
        >
          <span>
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
              <IconCurrencyDollar size={13} /> {t('fxCurrent')}
            </span>
            <span className="mt-1 block font-mono text-sm text-ink tabular-nums">1 USD = {fmtInt(rate)} HTG</span>
            <span className="mt-0.5 block font-mono text-[10px] text-ink/45">
              {lastFxAdmin ? t('fxLastBy', { name: lastFxAdmin }) : t('fxNeverEdited')} · {fmtDateTime(updatedAt, locale)}
            </span>
          </span>
          <IconArrowRight size={18} className="shrink-0 text-ochre" />
        </Link>
      </div>

      <MaintenancePanel enabled={platform.maintenance.enabled} messageHt={platform.maintenance.message_ht} messageFr={platform.maintenance.message_fr} />
    </div>
  );
}
