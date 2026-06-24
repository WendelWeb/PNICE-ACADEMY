import { getTranslations } from 'next-intl/server';
import { IconCircleX } from '@tabler/icons-react';
import { fmtInt, fmtPct } from '@/lib/admin/format';
import type { ReasonCount } from '@/lib/admin/data';

export async function CancellationReasons({ reasons }: { reasons: ReasonCount[] }) {
  const t = await getTranslations('admin.subs.reasons');
  const total = reasons.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...reasons.map((r) => r.count));

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconCircleX size={13} />
        {t('title')}
      </h2>
      {reasons.length === 0 ? (
        <p className="mt-3 font-mono text-xs text-graphite/55">{t('empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {reasons.map((r) => (
            <li key={r.reason}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-ink/80">{t(`reason.${r.reason}`)}</span>
                <span className="font-mono text-xs text-ink/60 tabular-nums">
                  {fmtInt(r.count)} · {fmtPct(total ? (r.count / total) * 100 : 0)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/8">
                <div className="h-full rounded-full bg-ochre" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
