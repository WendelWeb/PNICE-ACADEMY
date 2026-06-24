import { getTranslations } from 'next-intl/server';
import { IconCalendarClock, IconHandStop, IconRefresh } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { fmtUsdCents, fmtDate, fmtInt } from '@/lib/admin/format';
import type { RenewalRow, RenewalDay } from '@/lib/admin/data';
import { LazyRenewalChart } from './LazyRenewalChart';

/** Task 6 — renewals in the next 7 days, manual highlighted from auto. */
export async function Renewals7Panel({ rows, locale }: { rows: RenewalRow[]; locale: 'ht' | 'fr' }) {
  const t = await getTranslations('admin.subs.renewals');
  const manual = rows.filter((r) => !r.auto);
  const auto = rows.filter((r) => r.auto);
  const sum = (rs: RenewalRow[]) => rs.reduce((s, r) => s + r.amountCents, 0);

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
          <IconCalendarClock size={13} />
          {t('next7')}
        </h2>
        <span className="font-mono text-xs text-ink tabular-nums">{fmtUsdCents(sum(rows))}</span>
      </div>

      <Group title={t('manual')} icon={<IconHandStop size={12} className="text-ochre" />} rows={manual} total={sum(manual)} locale={locale} emptyText={t('none')} highlight />
      <Group title={t('auto')} icon={<IconRefresh size={12} className="text-teal" />} rows={auto} total={sum(auto)} locale={locale} emptyText={t('none')} />
    </section>
  );
}

async function Group({
  title,
  icon,
  rows,
  total,
  locale,
  emptyText,
  highlight,
}: {
  title: string;
  icon: React.ReactNode;
  rows: RenewalRow[];
  total: number;
  locale: 'ht' | 'fr';
  emptyText: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn('mt-3 rounded-lg p-2.5', highlight ? 'bg-ochre/[0.06]' : 'bg-paper')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink/55">
          {icon} {title}
        </span>
        <span className="font-mono text-[11px] text-ink/60 tabular-nums">
          {fmtInt(rows.length)} · {fmtUsdCents(total)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-1 font-mono text-[11px] text-graphite/45">{emptyText}</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-[12px]">
              <Link href={`/admin/utilisateurs/${r.userId}`} className="truncate text-ink/80 hover:text-ochre">
                {r.userName}
              </Link>
              <span className="shrink-0 font-mono text-[10px] text-ink/50 tabular-nums">
                {fmtDate(r.currentPeriodEnd, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Task 7 — renewals distribution over the next 30 days (lazy chart). */
export async function Renewals30Panel({ series }: { series: RenewalDay[] }) {
  const t = await getTranslations('admin.subs.renewals');
  const totalCents = series.at(-1)?.cumulativeCents ?? 0;
  const totalCount = series.reduce((s, d) => s + d.count, 0);

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4 lg:col-span-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('next30')}</h2>
        <span className="font-mono text-xs text-ink/60 tabular-nums">
          {fmtInt(totalCount)} · {fmtUsdCents(totalCents)}
        </span>
      </div>
      <div className="mt-3">
        <LazyRenewalChart series={series} />
      </div>
    </section>
  );
}
