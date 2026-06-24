import { getTranslations } from 'next-intl/server';
import { IconAlertTriangle, IconRefresh, IconHandStop } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { fmtUsdCents, fmtDate } from '@/lib/admin/format';
import type { DunningRow } from '@/lib/admin/data';
import { RemindButton } from './RemindButton';

export async function DunningPanel({ rows, locale }: { rows: DunningRow[]; locale: 'ht' | 'fr' }) {
  const t = await getTranslations('admin.subs.dunning');
  const totalCents = rows.reduce((s, r) => s + r.amountCents, 0);

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconAlertTriangle size={13} className="text-stampred" />
          {t('title')}
        </h2>
        <span className="font-mono text-xs text-stampred tabular-nums">{fmtUsdCents(totalCents)}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('note')}</p>

      {rows.length === 0 ? (
        <p className="mt-3 font-mono text-xs text-graphite/55">{t('empty')}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
                <th className="py-1.5 pr-2">{t('user')}</th>
                <th className="py-1.5 pr-2">{t('provider')}</th>
                <th className="py-1.5 pr-2 text-right">{t('amount')}</th>
                <th className="py-1.5 pr-2">{t('firstFailed')}</th>
                <th className="py-1.5 pr-2 text-right">{t('attempts')}</th>
                <th className="py-1.5 text-right">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/8 last:border-0">
                  <td className="py-2 pr-2">
                    <Link href={`/admin/utilisateurs/${r.userId}`} className="text-[13px] text-ink hover:text-ochre">
                      {r.userName}
                    </Link>
                  </td>
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-1 text-[12px] text-ink/75">
                      {r.auto ? <IconRefresh size={12} className="text-teal" /> : <IconHandStop size={12} className="text-ochre" />}
                      {r.provider}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right font-mono text-[12px] text-stampred tabular-nums">{fmtUsdCents(r.amountCents)}</td>
                  <td className="py-2 pr-2 font-mono text-[11px] text-ink/65 tabular-nums">{fmtDate(r.firstFailedAt, locale)}</td>
                  <td className="py-2 pr-2 text-right font-mono text-[12px] text-ink/70 tabular-nums">{r.attempts}</td>
                  <td className="py-2 text-right">
                    <RemindButton userId={r.userId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
