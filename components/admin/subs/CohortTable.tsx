import { getTranslations } from 'next-intl/server';
import { IconLayoutGrid } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { fmtInt } from '@/lib/admin/format';
import type { CohortRow } from '@/lib/admin/data';

function cohortLabel(key: string, locale: 'ht' | 'fr'): string {
  const [yy, mm] = key.split('-').map(Number);
  return new Date(yy, mm - 1, 1).toLocaleDateString(locale === 'ht' ? 'fr' : locale, {
    month: 'short',
    year: '2-digit',
  });
}

export async function CohortTable({ rows, locale }: { rows: CohortRow[]; locale: 'ht' | 'fr' }) {
  const t = await getTranslations('admin.subs.cohorts');
  const months = rows[0]?.retention.length ?? 7;

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconLayoutGrid size={13} />
        {t('title')}
      </h2>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('help')}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
              <th className="px-2 py-1.5">{t('cohort')}</th>
              <th className="px-2 py-1.5 text-right">{t('size')}</th>
              {Array.from({ length: months }).map((_, i) => (
                <th key={i} className="px-2 py-1.5 text-center">
                  M{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cohort}>
                <td className="whitespace-nowrap px-2 py-1 font-mono text-[11px] text-ink/75">
                  {cohortLabel(row.cohort, locale)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[11px] text-ink/60 tabular-nums">
                  {fmtInt(row.size)}
                </td>
                {row.retention.map((pct, i) => (
                  <td key={i} className="px-0.5 py-0.5">
                    {pct === null ? (
                      <span className="block h-7 rounded bg-ink/[0.03]" />
                    ) : (
                      <span
                        className={cn(
                          'flex h-7 items-center justify-center rounded font-mono text-[11px] tabular-nums',
                          pct > 55 ? 'text-paper-light' : 'text-ink/80',
                        )}
                        style={{ background: `rgba(31,110,102,${0.06 + (pct / 100) * 0.84})` }}
                      >
                        {pct}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
