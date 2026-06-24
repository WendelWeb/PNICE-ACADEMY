import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  IconPlugConnected,
  IconAlertTriangle,
  IconBug,
} from '@tabler/icons-react';
import { getWebhookLogs, getErrorLogs } from '@/lib/admin/data';
import { parseWebhookQuery } from '@/lib/admin/support-query';
import { checkBunnyStream } from '@/lib/admin/health/bunny';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { WebhookFilters } from '@/components/admin/health/WebhookFilters';
import { ReplayButton } from '@/components/admin/health/ReplayButton';
import { BunnyStatusCard } from '@/components/admin/health/BunnyStatusCard';
import { WebhookStatusBadge } from '@/components/admin/support/ui';
import { fmtDateTime, fmtInt } from '@/lib/admin/format';
import { cn } from '@/lib/cn';
import type { RawSearchParams } from '@/lib/admin/users-query';

export const dynamic = 'force-dynamic';

const HOUR = 3_600_000;

export default async function SantePage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('support.read'))) return <Forbidden />;
  const canAct = await hasCap('support.act');
  const t = await getTranslations('admin.health');

  const [webhooks, errors, bunny] = await Promise.all([
    getWebhookLogs(parseWebhookQuery(searchParams)),
    getErrorLogs(),
    checkBunnyStream(),
  ]);

  const now = Date.now();
  const staleFailures = webhooks.filter((w) => w.status === 'failed' && now - Date.parse(w.receivedAt) > HOUR).length;

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <BunnyStatusCard initial={bunny} />

      {/* Webhooks */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
            <IconPlugConnected size={13} /> {t('webhooks.title')}
          </h2>
          {staleFailures > 0 && (
            <span className="flex items-center gap-1.5 rounded-lg bg-stampred/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-stampred">
              <IconAlertTriangle size={13} /> {t('webhooks.staleAlert', { count: staleFailures })}
            </span>
          )}
        </div>
        <WebhookFilters />
        <div className="overflow-x-auto rounded-xl border border-ink/12 bg-paper-light">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
                <th className="px-3 py-2">{t('webhooks.provider')}</th>
                <th className="px-3 py-2">{t('webhooks.event')}</th>
                <th className="px-3 py-2">{t('webhooks.received')}</th>
                <th className="px-3 py-2">{t('webhooks.status')}</th>
                <th className="px-3 py-2">{t('webhooks.error')}</th>
                <th className="px-3 py-2 text-right">{t('webhooks.action')}</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center font-mono text-xs text-graphite/55">{t('webhooks.empty')}</td></tr>
              )}
              {webhooks.map((w) => {
                const stale = w.status === 'failed' && now - Date.parse(w.receivedAt) > HOUR;
                return (
                  <tr key={w.id} className={cn('border-b border-ink/8 last:border-0', w.status === 'failed' && 'bg-stampred/[0.04]')}>
                    <td className="px-3 py-2 font-mono text-[11px] uppercase text-ink/70">{w.provider}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink/65">{w.eventType}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink/55 tabular-nums">{fmtDateTime(w.receivedAt, locale)}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <WebhookStatusBadge status={w.status} label={t(`webhooks.${w.status}`)} />
                        {stale && <span className="font-mono text-[9px] uppercase text-stampred">{t('webhooks.stale')}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[260px] truncate font-mono text-[10px] text-stampred/90">{w.errorMessage ?? ''}</td>
                    <td className="px-3 py-2 text-right">{w.status === 'failed' ? <ReplayButton id={w.id} canAct={canAct} /> : <span className="font-mono text-[10px] text-ink/30">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Error logs */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconBug size={13} /> {t('errors.title')}
        </h2>
        <p className="font-mono text-[11px] text-graphite/55">{t('errors.note')}</p>
        <ul className="space-y-2">
          {errors.length === 0 && <li className="rounded-xl border border-ink/12 bg-paper-light p-4 text-center font-mono text-xs text-graphite/55">{t('errors.empty')}</li>}
          {errors.map((e) => (
            <li key={e.id} className="rounded-xl border border-ink/12 bg-paper-light p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words font-mono text-[12px] text-stampred">{e.message}</p>
                <span className="shrink-0 rounded bg-stampred/10 px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-stampred">×{fmtInt(e.count)}</span>
              </div>
              <pre className="mt-1.5 overflow-x-auto rounded bg-ink/[0.03] p-2 font-mono text-[10px] leading-relaxed text-ink/55">{e.stackTruncated}</pre>
              <p className="mt-1.5 flex flex-wrap gap-3 font-mono text-[10px] text-ink/45">
                <span>{t('errors.route')}: <span className="text-ink/65">{e.route}</span></span>
                <span>{t('errors.first')}: {fmtDateTime(e.firstAt, locale)}</span>
                <span>{t('errors.last')}: {fmtDateTime(e.lastAt, locale)}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
