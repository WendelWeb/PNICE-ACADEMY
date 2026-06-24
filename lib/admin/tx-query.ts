/**
 * Parse the transactions-list query from URL search params (Lot 3). Param names:
 * q, method, status, product, from, to, segment, sort, dir, page. Reuses
 * mergeParams/paramsOf from users-query.
 */
import type {
  TxQuery,
  PaymentMethod,
  PaymentStatus,
  ProductType,
  TxSortKey,
  TxSegment,
  SortDir,
} from '@/lib/admin/data';
import type { RawSearchParams } from '@/lib/admin/users-query';

const METHODS: PaymentMethod[] = ['moncash', 'natcash', 'card', 'paypal', 'crypto'];
const STATUSES: PaymentStatus[] = ['succeeded', 'pending', 'failed', 'refunded'];
const PRODUCTS: ProductType[] = ['course', 'subscription'];
const SORTS: TxSortKey[] = ['date', 'amount'];

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export function parseTxQuery(sp: RawSearchParams): TxQuery {
  const q: TxQuery = {};
  const search = one(sp.q)?.trim();
  if (search) q.search = search;

  const method = one(sp.method);
  if (method && METHODS.includes(method as PaymentMethod)) q.method = method as PaymentMethod;

  const status = one(sp.status);
  if (status && STATUSES.includes(status as PaymentStatus)) q.status = status as PaymentStatus;

  const product = one(sp.product);
  if (product && PRODUCTS.includes(product as ProductType)) q.productType = product as ProductType;

  const from = one(sp.from);
  if (from) q.from = from;
  const to = one(sp.to);
  if (to) q.to = to;

  if (one(sp.segment) === 'failed_pending') q.segment = 'failed_pending' as TxSegment;

  const sort = one(sp.sort);
  if (sort && SORTS.includes(sort as TxSortKey)) q.sort = sort as TxSortKey;
  const dir = one(sp.dir);
  if (dir === 'asc' || dir === 'desc') q.dir = dir as SortDir;

  const page = Number(one(sp.page));
  if (Number.isInteger(page) && page > 0) q.page = page;

  return q;
}
