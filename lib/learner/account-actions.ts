'use server';

/**
 * Learner-facing account mutations (Stage: learner account). One action:
 * replying on the learner's OWN support ticket — which finally makes the
 * admin reply email's "reponn depi espas ou" ("reply from your account
 * space") a true statement.
 *
 * Reuses the existing reply model (`support_replies`, authorType 'user' —
 * the shape lib/admin/data/real/support.ts's `replyTicket` writes for
 * admins) rather than inventing a parallel thread. Ownership is enforced
 * server-side: the ticket must belong to the signed-in learner's own
 * users.id, mirroring lib/learner/account.ts's `getMyTicketThread`.
 */
import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { clerkEnabled } from '@/lib/clerk';
import { resolveUserId } from './access';

const T = schema;

const REPLY_MAX_LENGTH = 4000;

export type LearnerReplyResult = { ok: boolean; message?: string };

export async function replyToMyTicketAction(
  ticketId: string,
  body: string,
): Promise<LearnerReplyResult> {
  try {
    if (!clerkEnabled || !process.env.DATABASE_URL) return { ok: false, message: 'not_configured' };
    const { userId: clerkId } = await auth();
    if (!clerkId) return { ok: false, message: 'unauthorized' };

    const trimmed = body.trim().slice(0, REPLY_MAX_LENGTH);
    if (!trimmed) return { ok: false, message: 'empty' };

    const userId = await resolveUserId(clerkId);
    if (!userId) return { ok: false, message: 'not_found' };

    const [ticket] = await db
      .select({ id: T.supportTickets.id, userId: T.supportTickets.userId, status: T.supportTickets.status })
      .from(T.supportTickets)
      .where(eq(T.supportTickets.id, ticketId))
      .limit(1);
    // Foreign ticket behaves exactly like a missing one — no existence leak.
    if (!ticket || ticket.userId !== userId) return { ok: false, message: 'not_found' };

    const cu = await currentUser();
    const authorName =
      [cu?.firstName, cu?.lastName].filter(Boolean).join(' ') ||
      cu?.username ||
      cu?.emailAddresses?.[0]?.emailAddress ||
      'Elèv';

    await db.insert(T.supportReplies).values({
      ticketId: ticket.id,
      authorType: 'user',
      authorId: userId,
      authorName,
      body: trimmed,
    });
    // A learner reply on a resolved ticket reopens the conversation so the
    // support queue actually sees it; otherwise just bump updatedAt.
    await db
      .update(T.supportTickets)
      .set({
        updatedAt: new Date(),
        ...(ticket.status === 'resolved' ? { status: 'open' as const } : {}),
      })
      .where(eq(T.supportTickets.id, ticket.id));
    return { ok: true };
  } catch (e) {
    console.error('[learner/account-actions] replyToMyTicketAction failed:', e);
    return { ok: false, message: 'error' };
  }
}
