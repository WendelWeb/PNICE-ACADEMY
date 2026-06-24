/**
 * Parse the promo-codes list query from URL search params (Phase D Lot 1).
 * Params: q, status, type, sort, dir. Reuses RawSearchParams from users-query.
 */
import type { PromoQuery, PromoStatus, DiscountType, PromoSortKey, SortDir } from '@/lib/admin/data';
import type { RawSearchParams } from '@/lib/admin/users-query';

const STATUSES: PromoStatus[] = ['active', 'scheduled', 'expired', 'depleted', 'disabled'];
const TYPES: DiscountType[] = ['percent', 'fixed'];
const SORTS: PromoSortKey[] = ['expiry', 'usage'];

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parsePromoQuery(sp: RawSearchParams): PromoQuery {
  const q: PromoQuery = {};
  const search = one(sp.q)?.trim();
  if (search) q.search = search;

  const status = one(sp.status);
  if (status && STATUSES.includes(status as PromoStatus)) q.status = status as PromoStatus;

  const type = one(sp.type);
  if (type && TYPES.includes(type as DiscountType)) q.type = type as DiscountType;

  const sort = one(sp.sort);
  if (sort && SORTS.includes(sort as PromoSortKey)) q.sort = sort as PromoSortKey;
  const dir = one(sp.dir);
  if (dir === 'asc' || dir === 'desc') q.dir = dir as SortDir;

  return q;
}
