/**
 * Admin daily-digest cron (Task L5). Vercel Cron hits this once a day (see
 * vercel.json). Same CRON_SECRET bearer guard as abandoned-carts
 * (lib/cron/auth.ts) — no secret configured → 503, wrong/absent bearer → 401.
 *
 * Builds today's counts (new signups, new enrollments, revenue, open
 * tickets, failed webhooks) — reusing the existing real getters
 * (getTickets/getWebhookLogs via lib/admin/data, so it stays correct under
 * mock too) where that's cheap, and two small direct queries for the
 * "today" cuts that no existing getter exposes (getKpiOverview's
 * revenueThisMonthCents is month-scoped, not day-scoped). Then emails it
 * (env-gated no-op via lib/email/resend without RESEND_API_KEY) to the
 * bootstrap admin address (lib/admin/access.ts — there is no dedicated
 * "digest recipient" column; ADMIN_BOOTSTRAP_EMAILS is the only admin
 * contact the platform already tracks).
 *
 * `platform_settings.daily_digest_enabled` (getSupportSettings, editable at
 * /admin/plateforme — moved from /admin/parametres in Task A1) gates whether
 * the email actually goes out — the
 * schedule itself only controls WHEN this route is invoked, not whether
 * it's allowed to send.
 *
 * Safe with no DATABASE_URL (returns zeros, skipped) and no RESEND_API_KEY
 * (sendEmail no-ops). Read-only against checkout/business data (no writes
 * at all), so running it twice in a day just resends an informational
 * email with the same counts — never corrupts state.
 */
import { and, eq, gte } from 'drizzle-orm';
import { db, schema } from '@/db';
import { sendEmail } from '@/lib/email/resend';
import { buildDailyDigestHtml } from '@/lib/email/templates';
import { getSupportSettings, getTickets, getWebhookLogs } from '@/lib/admin/data';
import { bootstrapEmails } from '@/lib/admin/access';
import { checkCronAuth, cronAuthStatus } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function startOfTodayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function GET(req: Request): Promise<Response> {
  const authResult = checkCronAuth(req.headers.get('authorization'));
  const status = cronAuthStatus(authResult);
  if (status) return Response.json({ error: authResult }, { status });

  const empty = { signupsToday: 0, enrollmentsToday: 0, revenueTodayCents: 0, openTickets: 0, failedWebhooks: 0 };
  if (!process.env.DATABASE_URL) {
    return Response.json({ ...empty, sent: false, skipped: true, reason: 'not_configured' });
  }

  const T = schema;
  try {
    const since = startOfTodayUtc();

    const [settings, ticketPage, failedWebhooks, newUsers, newEnrollments, todaysPayments] = await Promise.all([
      getSupportSettings(),
      getTickets({ pageSize: 1 }),
      getWebhookLogs({ status: 'failed' }),
      db.select({ id: T.users.id }).from(T.users).where(gte(T.users.createdAt, since)),
      db.select({ id: T.enrollments.id }).from(T.enrollments).where(gte(T.enrollments.purchasedAt, since)),
      db
        .select({ amountCents: T.payments.amountCents })
        .from(T.payments)
        .where(and(gte(T.payments.createdAt, since), eq(T.payments.status, 'completed'))),
    ]);

    const summary = {
      signupsToday: newUsers.length,
      enrollmentsToday: newEnrollments.length,
      revenueTodayCents: todaysPayments.reduce((s, p) => s + p.amountCents, 0),
      openTickets: ticketPage.counts.open,
      failedWebhooks: failedWebhooks.length,
    };

    if (!settings.dailyDigestEnabled) {
      return Response.json({ ...summary, sent: false, skipped: true, reason: 'digest_disabled' });
    }

    const recipient = bootstrapEmails()[0];
    if (!recipient) {
      return Response.json({ ...summary, sent: false, skipped: true, reason: 'no_recipient' });
    }

    const { subject, html, text } = buildDailyDigestHtml({ locale: 'fr', dateIso: new Date().toISOString(), ...summary });
    const result = await sendEmail({ to: recipient, subject, html, text });

    return Response.json({ ...summary, sent: result.sent, skipped: result.skipped });
  } catch (e) {
    console.error('[cron:daily-digest] failed:', e instanceof Error ? e.message : e);
    return Response.json({ ...empty, sent: false, skipped: true, error: 'processing_error' }, { status: 500 });
  }
}
