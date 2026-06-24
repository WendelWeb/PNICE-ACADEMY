/**
 * Parse the subscriptions-list query from URL search params (Phase B Lot 2).
 * Params: q, status, provider, from, to, segment, sort, dir, page.
 */
import type {
  SubQuery,
  PaymentMethod,
  SubscriptionStatus,
  SubSortKey,
  SubSegment,
  SortDir,
} from '@/lib/admin/data';
import type { RawSearchParams } from '@/lib/admin/users-query';

const PROVIDERS: PaymentMethod[] = ['moncash', 'natcash', 'card', 'paypal', 'crypto'];
const STATUSES: SubscriptionStatus[] = ['active', 'past_due', 'canceled'];
const SORTS: SubSortKey[] = ['renewal', 'mrr'];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseSubQuery(sp: RawSearchParams): SubQuery {
  const q: SubQuery = {};
  const search = one(sp.q)?.trim();
  if (search) q.search = search;

  const status = one(sp.status);
  if (status && STATUSES.includes(status as SubscriptionStatus)) {
    q.status = status as SubscriptionStatus;
  }

  const provider = one(sp.provider);
  if (provider && PROVIDERS.includes(provider as PaymentMethod)) {
    q.provider = provider as PaymentMethod;
  }

  const from = one(sp.from);
  if (from) q.from = from;
  const to = one(sp.to);
  if (to) q.to = to;

  const segment = one(sp.segment);
  if (segment === 'renew7' || segment === 'dunning') q.segment = segment as SubSegment;

  const sort = one(sp.sort);
  if (sort && SORTS.includes(sort as SubSortKey)) q.sort = sort as SubSortKey;
  const dir = one(sp.dir);
  if (dir === 'asc' || dir === 'desc') q.dir = dir as SortDir;

  const page = Number(one(sp.page));
  if (Number.isInteger(page) && page > 0) q.page = page;

  return q;
}
