/**
 * Real (Drizzle) Transactions domain — same vocabulary mapping as ./users.ts:
 * DB payments.status 'completed' → UI 'succeeded'; provider 'stripe' → 'card'.
 *
 * The mock (`lib/admin/data/mock/index.ts`, `selectTx`/`exportTransactions`) is
 * the reference for every method's exact shape and filtering semantics; this
 * file reproduces that behaviour from real rows. See the file-level deviations
 * noted in the Task 10 report for the couple of spots where this intentionally
 * does not byte-for-byte match the mock (search fields, method-volume rows).
 */
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { payments, users } from '@/db/schema';
import { getCourse } from '@/data/courses';
import type {
  MethodVolume,
  PaymentMethod,
  PaymentStatus,
  TxPage,
  TxQuery,
  TxRow,
} from '../types';

type DbPayment = typeof payments.$inferSelect;
type DbPaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
type DbProvider = 'stripe' | 'paypal' | 'moncash' | 'natcash' | 'crypto';

const statusToUi = (s: DbPaymentStatus): PaymentStatus =>
  s === 'completed' ? 'succeeded' : s;
const uiToDbStatus = (s: PaymentStatus): DbPaymentStatus =>
  s === 'succeeded' ? 'completed' : s;
const providerToMethod = (p: DbProvider): PaymentMethod =>
  p === 'stripe' ? 'card' : p;
const methodToProvider = (m: PaymentMethod): DbProvider =>
  m === 'card' ? 'stripe' : m;

const STALE_MS = 24 * 60 * 60 * 1000;

/** Mirrors mock's selectTx row-building: same string literals + fallback chain. */
function toRow(p: DbPayment, u: { name: string | null; email: string }): TxRow {
  const isSub = p.productType === 'subscription';
  const course = !isSub && p.courseSlug ? getCourse(p.courseSlug) : undefined;
  const uiStatus = statusToUi(p.status);
  return {
    id: p.id,
    userId: p.userId,
    userName: u.name ?? u.email,
    userEmail: u.email,
    productType: p.productType,
    productCode: isSub ? null : (course?.code ?? null),
    productTitle_fr: isSub ? 'Abonnement mensuel' : (course?.title_fr ?? p.courseSlug ?? '—'),
    productTitle_ht: isSub ? 'Abònman mansyèl' : (course?.title_ht ?? p.courseSlug ?? '—'),
    method: providerToMethod(p.provider),
    status: uiStatus,
    amountCents: p.amountCents,
    createdAt: p.createdAt.toISOString(),
    stalePending:
      uiStatus === 'pending' && Date.now() - p.createdAt.getTime() > STALE_MS,
  };
}

/**
 * Filters shared by the list, its total count, and the export — everything
 * except status/segment (those are "on top of" this base, see buildFullWhere).
 * Kept separate so `counts.{all,failed,pending}` can ignore status/segment
 * while still respecting search/method/productType/date range, matching the
 * mock's `txMatchesBase` (counts are computed from `base`, before `segment`/
 * `status` narrow it down to `filtered`).
 */
function buildBaseWhere(q: TxQuery) {
  const conds = [];
  if (q.method) conds.push(eq(payments.provider, methodToProvider(q.method)));
  if (q.productType) conds.push(eq(payments.productType, q.productType));
  if (q.from) conds.push(gte(payments.createdAt, new Date(q.from)));
  if (q.to) conds.push(lte(payments.createdAt, new Date(q.to)));
  if (q.search) {
    const term = `%${q.search}%`;
    conds.push(
      or(ilike(users.email, term), ilike(users.name, term), ilike(payments.providerRef, term)),
    );
  }
  return conds.length ? and(...conds) : undefined;
}

/** buildBaseWhere() plus the status/segment narrowing (mock's `filtered`). */
function buildFullWhere(q: TxQuery) {
  const base = buildBaseWhere(q);
  const extra = [];
  if (q.status) extra.push(eq(payments.status, uiToDbStatus(q.status)));
  if (q.segment === 'failed_pending')
    extra.push(or(eq(payments.status, 'failed'), eq(payments.status, 'pending')));
  if (extra.length === 0) return base;
  return base ? and(base, ...extra) : and(...extra);
}

export async function getTransactions(q: TxQuery): Promise<TxPage> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = q.pageSize ?? 50;
  const where = buildFullWhere(q);
  const baseWhere = buildBaseWhere(q);

  const orderCol = q.sort === 'amount' ? payments.amountCents : payments.createdAt;
  const orderBy = q.dir === 'asc' ? asc(orderCol) : desc(orderCol);

  const rows = await db
    .select({ p: payments, name: users.name, email: users.email })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .where(where);

  const [counts] = await db
    .select({
      all: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${payments.status} = 'failed')::int`,
      pending: sql<number>`count(*) filter (where ${payments.status} = 'pending')::int`,
    })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .where(baseWhere);

  return {
    rows: rows.map((r) => toRow(r.p, { name: r.name, email: r.email })),
    total,
    page,
    pageSize,
    counts,
  };
}

/**
 * Contract requires `Promise<TxRow[]>` (see ../types.ts) — the mock's
 * `exportTransactions` returns the fully filtered+sorted row set with no
 * page/pageSize slicing (`selectTx(query).filtered`), not a CSV string; this
 * mirrors that exactly. Any CSV formatting happens at the route/caller level.
 */
export async function exportTransactions(q: TxQuery): Promise<TxRow[]> {
  const where = buildFullWhere(q);
  const orderCol = q.sort === 'amount' ? payments.amountCents : payments.createdAt;
  const orderBy = q.dir === 'asc' ? asc(orderCol) : desc(orderCol);

  const rows = await db
    .select({ p: payments, name: users.name, email: users.email })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .where(where)
    .orderBy(orderBy);

  return rows.map((r) => toRow(r.p, { name: r.name, email: r.email }));
}

export async function getMethodVolumes(): Promise<MethodVolume[]> {
  const rows = await db
    .select({
      provider: payments.provider,
      grossCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(eq(payments.status, 'completed'))
    .groupBy(payments.provider);
  return rows.map((r) => ({
    method: providerToMethod(r.provider),
    grossCents: r.grossCents,
    count: r.count,
  }));
}
