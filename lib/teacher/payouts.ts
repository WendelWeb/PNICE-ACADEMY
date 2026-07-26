/**
 * lib/teacher/payouts.ts — admin-facing withdrawal-queue data access +
 * mutations (Task C3-T5, `/admin/retraits`). Mirrors `lib/teacher/admin.ts`'s
 * division of labour exactly: reads AND the mutation/`recordAudit` pattern
 * live together here; the 'use server' auth wrapper
 * (lib/teacher/payout-actions.ts) only adds the
 * `requireAdmin('payouts.process')` check + try/catch, same as
 * `lib/teacher/admin-actions.ts` does over this file's admin equivalent.
 *
 * GATED + NEVER-THROW reads (mirrors lib/teacher/admin.ts / profile.ts
 * exactly): no DATABASE_URL or a failed query ⇒ a safe empty value, never
 * throws — so `/admin/retraits` renders an empty queue instead of crashing
 * pre-migration. Mutations are ALSO gated (`dbConfigured()` first) — same
 * `{ ok: false, message: 'db_required' }` contract as lib/teacher/admin.ts's
 * mutations.
 *
 * MONEY: marking a withdrawal 'paid' inserts a negative 'withdrawal'
 * earnings_ledger row (gross/commission = 0 — a payout isn't a sale, there's
 * nothing to split; `net_cents = -amount_cents`) — the ONE place a payout
 * actually debits a teacher's balance (balance = SUM(net_cents), never
 * denormalised — same invariant lib/teacher/earnings.ts enforces for
 * sale/refund rows). Rejecting a withdrawal writes NO ledger row — the
 * balance was never actually debited, so there's nothing to reverse.
 *
 * IDEMPOTENCY: both mutations are guarded by a `current.status === 'pending'`
 * precondition — a second call on an already paid/rejected row (double-
 * click, a retried server action) resolves to
 * `{ ok: false, message: 'invalid_status' }` rather than double-writing a
 * ledger row or re-processing. The pre-check alone is a plain read-then-act
 * and doesn't stop two concurrent calls from both passing it, so the actual
 * guard is the UPDATE itself: it's conditioned on `status = 'pending'`
 * (`WHERE id = ? AND status = 'pending'`) and only proceeds (inserts the
 * withdrawal ledger row, in markWithdrawalPaid's case) if `.returning()`
 * came back non-empty — i.e. this call's UPDATE was the one that actually
 * claimed the row. A second concurrent caller's UPDATE matches zero rows and
 * gets `{ ok: false, message: 'invalid_status' }` with no side effect.
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { recordAudit } from '@/lib/admin/data/real/users';
import { getTeacherBalanceCents, mapDbWithdrawalRow, type WithdrawalRow } from './profile';
import type { AdminActor } from '@/lib/admin/data/types';

const T = schema;

export type WithdrawalAdminRow = WithdrawalRow & {
  teacherName: string | null;
  teacherEmail: string;
  /** The teacher's CURRENT balance (SUM(net_cents)) — re-derived, never denormalised. */
  balanceCents: number;
};

export type PayoutResult = { ok: boolean; message?: string };

function dbRequired(): PayoutResult {
  return { ok: false, message: 'db_required' };
}

/**
 * Every `withdrawal_requests` row joined with the requesting teacher's
 * name/email + their CURRENT balance (`getTeacherBalanceCents`), optionally
 * narrowed to one status (the `/admin/retraits` tab filter). Pending rows
 * sort oldest-first (first-come-first-served for the admin queue); paid/
 * rejected rows sort newest-first. GATED + FALLBACK: no DATABASE_URL or a
 * failed query ⇒ `[]`, never throws.
 */
export async function listWithdrawalRequests(status?: WithdrawalRow['status']): Promise<WithdrawalAdminRow[]> {
  if (!dbConfigured()) return [];
  try {
    const rows = await db
      .select({ withdrawal: T.withdrawalRequests, user: T.users })
      .from(T.withdrawalRequests)
      .innerJoin(T.users, eq(T.withdrawalRequests.teacherUserId, T.users.id));
    const filtered = status ? rows.filter((r) => r.withdrawal.status === status) : rows;
    const withBalance = await Promise.all(
      filtered.map(async ({ withdrawal, user }) => {
        const mapped = mapDbWithdrawalRow(withdrawal);
        const balanceCents = await getTeacherBalanceCents(user.id);
        return { ...mapped, teacherName: user.name ?? null, teacherEmail: user.email, balanceCents };
      }),
    );
    return withBalance.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return a.status === 'pending'
        ? a.createdAt.localeCompare(b.createdAt) // oldest pending first
        : b.createdAt.localeCompare(a.createdAt); // newest processed first
    });
  } catch (err) {
    console.error('[teacher/payouts] listWithdrawalRequests DB read failed, falling back to []:', err);
    return [];
  }
}

/** Count of `pending` withdrawal_requests, for the queue's badge. GATED + FALLBACK: no DATABASE_URL or a failed query ⇒ 0, never throws. */
export async function countPendingWithdrawals(): Promise<number> {
  if (!dbConfigured()) return 0;
  try {
    const rows = await db.select({ status: T.withdrawalRequests.status }).from(T.withdrawalRequests);
    return rows.filter((r) => r.status === 'pending').length;
  } catch (err) {
    console.error('[teacher/payouts] countPendingWithdrawals DB read failed, falling back to 0:', err);
    return 0;
  }
}

/** Count of `withdrawal_requests` rows per status, for `/admin/retraits`'s tab badges. GATED + FALLBACK: no DATABASE_URL or a failed query ⇒ all-zero, never throws. */
export async function countWithdrawalsByStatus(): Promise<Record<WithdrawalRow['status'], number>> {
  const zero: Record<WithdrawalRow['status'], number> = { pending: 0, paid: 0, rejected: 0 };
  if (!dbConfigured()) return zero;
  try {
    const rows = await db.select({ status: T.withdrawalRequests.status }).from(T.withdrawalRequests);
    const counts = { ...zero };
    for (const r of rows) counts[r.status]++;
    return counts;
  } catch (err) {
    console.error('[teacher/payouts] countWithdrawalsByStatus DB read failed, falling back to zero:', err);
    return zero;
  }
}

/* ------------------------------- mutations -------------------------------- */

/**
 * Marks a `pending` withdrawal request 'paid': records the reference, the
 * processing admin + timestamp, AND inserts the negative 'withdrawal'
 * earnings_ledger row that actually debits the teacher's balance (see file
 * header). Requires `current.status === 'pending'` (idempotency guard).
 */
export async function markWithdrawalPaid(p: { id: string; reference: string; admin: AdminActor }): Promise<PayoutResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db.select().from(T.withdrawalRequests).where(eq(T.withdrawalRequests.id, p.id)).limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'pending') return { ok: false, message: 'invalid_status' };

  // Atomic claim: the UPDATE itself is conditioned on status = 'pending', so
  // two concurrent admin calls can't both pass the pre-check above and then
  // both proceed to insert a ledger row — only whichever call's UPDATE
  // actually flips the row (returning a row) gets to record the debit.
  const claimed = await db
    .update(T.withdrawalRequests)
    .set({
      status: 'paid',
      processedBy: p.admin.id,
      processedAt: new Date(),
      reference: p.reference,
      updatedAt: new Date(),
    })
    .where(and(eq(T.withdrawalRequests.id, p.id), eq(T.withdrawalRequests.status, 'pending')))
    .returning({ id: T.withdrawalRequests.id });
  if (claimed.length === 0) return { ok: false, message: 'invalid_status' };

  await db.insert(T.earningsLedger).values({
    teacherUserId: current.teacherUserId,
    paymentId: null,
    kind: 'withdrawal',
    grossCents: 0,
    commissionPctApplied: 0,
    commissionCents: 0,
    netCents: -current.amountCents,
    currency: 'USD',
    note: `withdrawal_requests:${current.id}`,
  });

  await recordAudit({ action: 'mark_withdrawal_paid', userId: current.teacherUserId, admin: p.admin, detail: p.reference });
  return { ok: true };
}

/**
 * Rejects a `pending` withdrawal request with a required note — NO ledger
 * row (the balance was never actually debited, so there is nothing to
 * reverse). Requires `current.status === 'pending'` (idempotency guard).
 */
export async function rejectWithdrawal(p: { id: string; note: string; admin: AdminActor }): Promise<PayoutResult> {
  if (!dbConfigured()) return dbRequired();
  const [current] = await db
    .select({ status: T.withdrawalRequests.status, teacherUserId: T.withdrawalRequests.teacherUserId })
    .from(T.withdrawalRequests)
    .where(eq(T.withdrawalRequests.id, p.id))
    .limit(1);
  if (!current) return { ok: false, message: 'not_found' };
  if (current.status !== 'pending') return { ok: false, message: 'invalid_status' };

  // Atomic claim, same reasoning as markWithdrawalPaid: only the call whose
  // conditioned UPDATE actually flips the row proceeds (no side effect here
  // either way, but this keeps the two mutations from racing each other too).
  const claimed = await db
    .update(T.withdrawalRequests)
    .set({ status: 'rejected', note: p.note, processedBy: p.admin.id, processedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(T.withdrawalRequests.id, p.id), eq(T.withdrawalRequests.status, 'pending')))
    .returning({ id: T.withdrawalRequests.id });
  if (claimed.length === 0) return { ok: false, message: 'invalid_status' };

  await recordAudit({ action: 'reject_withdrawal', userId: current.teacherUserId, admin: p.admin, reason: p.note });
  return { ok: true };
}
