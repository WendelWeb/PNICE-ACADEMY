/**
 * Stage 2 (money-exactness pass) — the FINDING was "there is no refund path
 * at all for MonCash": the admin console's "Rembourser" button (and the
 * matching support-ticket refund action) flipped `payments.status` and
 * credited the buyer, but never told the teacher's earnings-ledger a refund
 * had happened, so a refunded MonCash sale kept crediting the teacher their
 * full share forever.
 *
 * `recordRefundReversal` could not move into lib/admin/data/real/users.ts's
 * `refundPayment` itself (see that function's doc comment — a client-bundle
 * boundary issue: that module is reachable from a Client Component and
 * cannot statically OR dynamically import anything that pulls in
 * `@clerk/nextjs/server`). It was wired instead into the two 'use server'
 * callers, which already import Clerk directly and are exempt from that
 * boundary check. This suite proves BOTH callers actually make the call:
 *  - lib/admin/actions.ts's `refundPaymentAction` (the Transactions console
 *    button);
 *  - lib/admin/support-actions.ts's `refundFromTicketAction` (refund-from-
 *    ticket in the support workbench).
 *
 * Auth/role plumbing is stubbed to a fixed 'admin' actor (own capability
 * matrix already exercised by lib/admin/permissions tests elsewhere) so this
 * suite stays focused on the one thing that regressed: does the reversal
 * call actually happen, with the right payment id, when a refund is issued.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'admin-1' })),
  clerkClient: vi.fn(async () => ({
    users: { getUser: vi.fn(async () => ({ id: 'admin-1', firstName: 'Admin', lastName: null, emailAddresses: [] })) },
  })),
  currentUser: vi.fn(async () => ({ id: 'admin-1', firstName: 'Admin', lastName: null, emailAddresses: [] })),
}));

vi.mock('@/lib/admin/access', () => ({
  resolveAdminRole: vi.fn(() => 'admin'), // has both transactions.refund and support.act
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const dataState = vi.hoisted(() => ({
  refundPaymentCalls: [] as unknown[],
  ticketDetail: null as unknown,
}));
vi.mock('@/lib/admin/data', () => ({
  // Exercised by this suite:
  refundPayment: vi.fn(async (p: unknown) => {
    dataState.refundPaymentCalls.push(p);
  }),
  getTicketById: vi.fn(async () => dataState.ticketDetail),
  setTicketStatus: vi.fn(async () => undefined),
  // Imported by lib/admin/actions.ts / lib/admin/support-actions.ts but not
  // exercised here — stubbed so the module graph resolves.
  grantCourseAccess: vi.fn(),
  revokeCourseAccess: vi.fn(),
  grantSubscription: vi.fn(),
  setUserStatus: vi.fn(),
  recordAudit: vi.fn(async () => undefined),
  revokeCertificate: vi.fn(),
  reissueCertificate: vi.fn(),
  issueCertificate: vi.fn(),
  getUsers: vi.fn(),
  getUserById: vi.fn(),
  assignTicket: vi.fn(),
  replyTicket: vi.fn(),
  createTicket: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getOpenUnassignedCount: vi.fn(),
  replayWebhook: vi.fn(),
  setSupportSettings: vi.fn(),
}));

vi.mock('@/lib/fx', () => ({ getFxRate: vi.fn(async () => 132), setFxRate: vi.fn(async () => undefined) }));
vi.mock('@/lib/platformPrice', () => ({ setPlatformPassPriceCents: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn(async () => ({ sent: false })),
  emailLive: () => false,
  DEFAULT_FROM: 'no-reply@example.com',
}));
vi.mock('@/lib/email/templates', () => ({
  buildReceiptHtml: vi.fn(),
  buildPaymentFailedHtml: vi.fn(),
  buildEngagementReminderHtml: vi.fn(),
  buildTestEmailHtml: vi.fn(),
  buildSupportReplyHtml: vi.fn(),
  buildTicketReceivedHtml: vi.fn(),
}));
vi.mock('@/lib/courses/source', () => ({ getCourseBySlug: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/health/bunny', () => ({ checkBunnyStream: vi.fn(async () => ({ ok: false })) }));

vi.mock('@/lib/teacher/earnings', () => ({
  recordRefundReversal: vi.fn(async () => undefined),
}));

import { refundPaymentAction } from './actions';
import { refundFromTicketAction } from './support-actions';
import { recordRefundReversal } from '@/lib/teacher/earnings';

beforeEach(() => {
  dataState.refundPaymentCalls = [];
  dataState.ticketDetail = null;
  vi.mocked(recordRefundReversal).mockClear();
});

describe('refundPaymentAction — Transactions console "Rembourser" button', () => {
  it('reverses the teacher earnings for the payment it just refunded, and records the admin\'s note', async () => {
    const result = await refundPaymentAction('user-1', 'payment-1', 'Remboursé via le tableau de bord Bazik', 'money_back');
    expect(result.ok).toBe(true);
    expect(dataState.refundPaymentCalls).toEqual([
      {
        userId: 'user-1',
        paymentId: 'payment-1',
        admin: { id: 'admin-1', name: 'Admin' },
        note: 'Remboursé via le tableau de bord Bazik',
        // ONE compensation: money already sent back, so NO internal credit.
        method: 'money_back',
      },
    ]);
    expect(recordRefundReversal).toHaveBeenCalledTimes(1);
    expect(recordRefundReversal).toHaveBeenCalledWith({ id: 'payment-1' });
  });

  it('Stage 3: refuses a refund with no note (the admin must state where/how the money moved) — no DB write, no reversal', async () => {
    const result = await refundPaymentAction('user-1', 'payment-1', '   ', 'money_back');
    expect(result).toEqual({ ok: false, message: 'note_required' });
    expect(dataState.refundPaymentCalls).toHaveLength(0);
    expect(recordRefundReversal).not.toHaveBeenCalled();
  });
});

describe('refundFromTicketAction — refund issued from a support ticket', () => {
  it('reverses the teacher earnings for the ticket\'s payment', async () => {
    dataState.ticketDetail = {
      ticket: { type: 'refund' },
      payment: { id: 'payment-2', userId: 'user-2', status: 'succeeded' },
    };
    const result = await refundFromTicketAction('ticket-1');
    expect(result.ok).toBe(true);
    expect(dataState.refundPaymentCalls).toEqual([
      // A refund ticket is "give me my money back" — always money_back, never
      // ALSO a store credit for the same amount.
      { userId: 'user-2', paymentId: 'payment-2', admin: { id: 'admin-1', name: 'Admin' }, method: 'money_back' },
    ]);
    expect(recordRefundReversal).toHaveBeenCalledTimes(1);
    expect(recordRefundReversal).toHaveBeenCalledWith({ id: 'payment-2' });
  });

  it('does NOT reverse earnings when the ticket is not a refundable payment (guard fails before refundPayment runs)', async () => {
    dataState.ticketDetail = {
      ticket: { type: 'refund' },
      payment: { id: 'payment-3', userId: 'user-3', status: 'refunded' }, // already refunded
    };
    const result = await refundFromTicketAction('ticket-2');
    expect(result).toEqual({ ok: false, message: 'not_refundable' });
    expect(dataState.refundPaymentCalls).toHaveLength(0);
    expect(recordRefundReversal).not.toHaveBeenCalled();
  });
});
