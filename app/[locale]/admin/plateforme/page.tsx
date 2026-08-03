import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { IconCurrencyDollar, IconAlertTriangle, IconArrowRight, IconReceipt2 } from '@tabler/icons-react';
import { resolveAdminRole } from '@/lib/admin/access';
import { getPlatform } from '@/lib/admin/platform/store';
import { getFxRate } from '@/lib/fx';
import { getPlatformPassPriceCents } from '@/lib/platformPrice';
import { getAuditLog, getReferralCreditCents, getSupportSettings } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { fmtDateTime, fmtInt } from '@/lib/admin/format';
import { formatUsd } from '@/lib/money';
import { Forbidden } from '@/components/admin/Forbidden';
import { Link } from '@/i18n/routing';
import { ProvidersPanel, MaintenancePanel } from '@/components/admin/platform/PlatformPanels';
import { ReferralCreditPanel } from '@/components/admin/marketing/ReferralCreditPanel';
import { DigestPanel } from '@/components/admin/health/DigestPanel';

export const dynamic = 'force-dynamic';
const DAY = 86_400_000;

export default async function PlatformPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  const { userId } = await auth();
  const client = await clerkClient();
  const me = userId ? await client.users.getUser(userId) : null;
  if (!me || resolveAdminRole(me) !== 'super-admin') return <Forbidden />;

  const t = await getTranslations('admin.platform');
  const platform = await getPlatform();
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

  // Task: two subscription products — the owner-set "Pass PNICE" all-access
  // price now has its own dedicated editor (/admin/prix, mirroring the FX
  // page); this is a read-only pointer to it, same pattern as the FX row
  // right below.
  const platformPassPriceCents = await getPlatformPassPriceCents();
  const lastPriceEdit = await getAuditLog({ action: 'set_platform_pass_price', pageSize: 1 });
  const lastPriceAdmin = lastPriceEdit.rows[0]?.adminName ?? null;
  const priceUpdatedAt = lastPriceEdit.rows[0]?.createdAt ?? null;

  // Moved here from /admin/parametres (Task A1, 2026-07-30 admin restructure):
  // these are business settings, not site content — same props/data loading
  // as before, just relocated onto the platform-settings page.
  const canEditReferral = await hasCap('users.act');
  const referralCreditCents = await getReferralCreditCents();
  const canEditDigest = await hasCap('support.act');
  const digest = await getSupportSettings();

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <ProvidersPanel providers={platform.providers} />

      {/* Task: per-teacher plan pricing (owner ask: "each teacher sets their
          own price") — the global subscription-price editor that used to
          live here (SubscriptionPricePanel) is retired: every teacher now
          sets their own monthly plan price from their own studio
          (lib/teacher/studio-actions.ts's `updateMyPlanAction`). This is a
          read-only pointer there, kept on this page so an admin looking for
          "where did the price setting go" finds an answer immediately.
          `platform_settings.subscription_usd_cents` (and this store's
          `subscriptionUsd` field) stay in place as the seed default for a
          brand-new teacher plan — see data/pricing.ts's SUBSCRIPTION_USD and
          lib/payments/products.ts's resolveProduct — just no longer editable
          from an admin panel. */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconReceipt2 size={13} /> {t('subprice.title')}
        </h2>
        <p className="mt-1.5 text-[11px] leading-snug text-graphite/70">{t('subprice.note')}</p>
        <Link
          href="/enseigner/studio"
          className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-ochre hover:underline"
        >
          {t('subprice.cta')} <IconArrowRight size={13} />
        </Link>
      </section>

      {/* Task: two subscription products — the DISTINCT, owner-set "Pass
          PNICE" all-access price (not a teacher's own plan price). Same
          read-only-pointer pattern as the FX row right below. */}
      <Link
        href="/admin/prix"
        className="flex items-center justify-between gap-2 rounded-xl border border-ink/12 bg-paper-light p-4 hover:border-ochre/40"
      >
        <span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
            <IconReceipt2 size={13} /> {t('platformPrice.title')}
          </span>
          <span className="mt-1 block font-mono text-sm text-ink tabular-nums">
            {formatUsd(platformPassPriceCents / 100)}{t('platformPrice.perMonth')}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] text-ink/45">
            {lastPriceAdmin ? t('platformPrice.lastBy', { name: lastPriceAdmin }) : t('platformPrice.neverEdited')} ·{' '}
            {fmtDateTime(priceUpdatedAt, locale)}
          </span>
        </span>
        <IconArrowRight size={18} className="shrink-0 text-ochre" />
      </Link>

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

      <ReferralCreditPanel currentUsd={referralCreditCents / 100} canEdit={canEditReferral} />
      <DigestPanel enabled={digest.dailyDigestEnabled} hour={digest.dailyDigestHour} canEdit={canEditDigest} />
    </div>
  );
}
