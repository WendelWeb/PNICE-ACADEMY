'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconChartBar } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { MethodVolume, PaymentMethod } from '@/lib/admin/data';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

// Manual fee estimates (editable). Not a real reconciliation — a simulation of
// the impact of provider fees on margin.
const DEFAULT_FEES: Record<PaymentMethod, { pct: number; fixed: number }> = {
  card: { pct: 2.9, fixed: 0.3 },
  paypal: { pct: 3.49, fixed: 0.49 },
  moncash: { pct: 3.0, fixed: 0 },
  natcash: { pct: 3.0, fixed: 0 },
  crypto: { pct: 1.0, fixed: 0 },
};

const usd = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export function ProviderFeesPanel({ volumes }: { volumes: MethodVolume[] }) {
  const t = useTranslations('admin.tx');
  const [fees, setFees] = useState(DEFAULT_FEES);

  const setFee = (m: PaymentMethod, key: 'pct' | 'fixed', value: number) =>
    setFees((f) => ({ ...f, [m]: { ...f[m], [key]: value } }));

  let totalGross = 0;
  let totalFees = 0;
  const rows = volumes.map((v) => {
    const gross = v.grossCents / 100;
    const f = fees[v.method];
    const fee = (gross * f.pct) / 100 + v.count * f.fixed;
    const net = gross - fee;
    totalGross += gross;
    totalFees += fee;
    return { method: v.method, count: v.count, gross, fee, net, f };
  });

  const inputCls =
    'w-16 rounded border border-ink/15 bg-paper px-1.5 py-1 text-right font-mono text-[11px] text-ink ' + focusRing;

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconChartBar size={13} /> {t('fees.title')}
      </h2>
      <p className="mt-2 text-xs text-graphite/70">{t('fees.help')}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
              <th className="py-1.5 pr-2">{t('fees.method')}</th>
              <th className="py-1.5 pr-2 text-right">{t('fees.volume')}</th>
              <th className="py-1.5 pr-2 text-right">{t('fees.pct')}</th>
              <th className="py-1.5 pr-2 text-right">{t('fees.fixed')}</th>
              <th className="py-1.5 pr-2 text-right">{t('fees.estFees')}</th>
              <th className="py-1.5 text-right">{t('fees.net')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.method} className="border-b border-ink/8 last:border-0">
                <td className="py-2 pr-2 text-[13px] text-ink/85">{t(`method.${r.method}`)}</td>
                <td className="py-2 pr-2 text-right font-mono text-[12px] text-ink tabular-nums">
                  {usd(r.gross)}
                  <span className="block text-[9px] text-ink/40">{r.count} tx</span>
                </td>
                <td className="py-2 pr-2 text-right">
                  <input
                    type="number" step="0.1" min="0" value={r.f.pct}
                    onChange={(e) => setFee(r.method, 'pct', Number(e.target.value))}
                    className={inputCls} aria-label={`${r.method} %`}
                  />
                </td>
                <td className="py-2 pr-2 text-right">
                  <input
                    type="number" step="0.01" min="0" value={r.f.fixed}
                    onChange={(e) => setFee(r.method, 'fixed', Number(e.target.value))}
                    className={inputCls} aria-label={`${r.method} fixed`}
                  />
                </td>
                <td className="py-2 pr-2 text-right font-mono text-[12px] text-stampred tabular-nums">
                  −{usd(r.fee)}
                </td>
                <td className="py-2 text-right font-mono text-[12px] font-medium text-teal tabular-nums">
                  {usd(r.net)}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink/15 font-semibold">
              <td className="py-2 pr-2 font-mono text-[11px] uppercase text-ink/60">{t('fees.total')}</td>
              <td className="py-2 pr-2 text-right font-mono text-[12px] text-ink tabular-nums">{usd(totalGross)}</td>
              <td />
              <td />
              <td className="py-2 pr-2 text-right font-mono text-[12px] text-stampred tabular-nums">−{usd(totalFees)}</td>
              <td className="py-2 text-right font-mono text-[12px] text-teal tabular-nums">{usd(totalGross - totalFees)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
