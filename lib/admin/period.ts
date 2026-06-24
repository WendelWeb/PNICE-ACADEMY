/**
 * Period selector shared logic (Phase B). Parses `?range=` (+ `from`/`to` for
 * custom) into a concrete [from, to] window and an auto-chosen granularity:
 * day ≤31d, week ≤92d, else month. Persisted in the URL so a view is shareable.
 */
import type { Granularity } from '@/lib/admin/data';

export type RangeKey = 'today' | '7d' | '30d' | '90d' | 'year' | 'custom';
export const RANGE_KEYS: RangeKey[] = ['today', '7d', '30d', '90d', 'year', 'custom'];

const DAY = 86_400_000;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parsePeriod(sp: Record<string, string | string[] | undefined>): {
  rangeKey: RangeKey;
  from: string;
  to: string;
  granularity: Granularity;
} {
  const now = new Date();
  const rk = one(sp.range);
  const rangeKey: RangeKey = (RANGE_KEYS as string[]).includes(rk ?? '')
    ? (rk as RangeKey)
    : '30d';

  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };

  let fromMs: number;
  let toMs = now.getTime();
  switch (rangeKey) {
    case 'today':
      fromMs = startOfDay(now);
      break;
    case '7d':
      fromMs = toMs - 7 * DAY;
      break;
    case '90d':
      fromMs = toMs - 90 * DAY;
      break;
    case 'year':
      fromMs = new Date(now.getFullYear(), 0, 1).getTime();
      break;
    case 'custom': {
      const f = one(sp.from);
      const t = one(sp.to);
      const fp = f ? Date.parse(f) : NaN;
      fromMs = Number.isFinite(fp) ? fp : toMs - 30 * DAY;
      const tp = t ? Date.parse(t) : NaN;
      if (Number.isFinite(tp)) toMs = tp + DAY - 1;
      break;
    }
    case '30d':
    default:
      fromMs = toMs - 30 * DAY;
  }

  const spanDays = (toMs - fromMs) / DAY;
  const granularity: Granularity = spanDays <= 31 ? 'day' : spanDays <= 92 ? 'week' : 'month';

  return {
    rangeKey,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    granularity,
  };
}
