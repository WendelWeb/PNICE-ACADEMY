/**
 * Abandoned-cart cron (Task L5). Vercel Cron hits this every 2h (see
 * vercel.json). Protected by the same CRON_SECRET bearer guard as
 * daily-digest (lib/cron/auth.ts) — no secret configured → 503, wrong/absent
 * bearer → 401. Mirrors the env-gate + never-log-secret pattern of
 * app/api/webhooks/clerk/route.ts and app/api/webhooks/stripe/route.ts.
 *
 * Logic:
 *  1. Any `checkout_sessions` row that's still open (completedAt null),
 *     started more than 2h ago, and not yet flagged → abandonedAt = now.
 *  2. Any abandoned cart with a signed-in userId and no reminder yet gets a
 *     relance email (env-gated no-op via lib/email/resend — safe without
 *     RESEND_API_KEY) and remindedAt = now — one attempt per cart, ever,
 *     mirroring lib/admin/data/real/marketing.ts's remindCart semantics.
 *     Deliberately scans ALL not-yet-reminded abandoned carts (not just the
 *     ones abandoned in this exact run) so a cart that missed its reminder
 *     window (e.g. RESEND wasn't configured yet) still gets one the next
 *     time this cron runs — remindedAt stays the single source of truth for
 *     "already handled", so this is still safe to run any number of times.
 *
 * Idempotent by construction: the abandonedAt write is guarded by an `IS NULL`
 * check on that column. The remindedAt write uses atomic CAS (compare-and-swap
 * via WHERE isNull): only the run that successfully UPDATEs remindedAt sends
 * the email, so re-running — including concurrent invocations — can only move
 * a row from null → set, never re-email an already-handled cart. Safe with
 * no DATABASE_URL (returns zeros) and no RESEND_API_KEY (sendEmail no-ops).
 */
import { and, eq, inArray, isNull, isNotNull, lt } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCourseBySlug } from '@/lib/courses/source';
import { sendEmail } from '@/lib/email/resend';
import { buildCartReminderHtml } from '@/lib/email/templates';
import { getFxRate } from '@/lib/fx';
import { checkCronAuth, cronAuthStatus } from '@/lib/cron/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export async function GET(req: Request): Promise<Response> {
  const authResult = checkCronAuth(req.headers.get('authorization'));
  const status = cronAuthStatus(authResult);
  if (status) return Response.json({ error: authResult }, { status });

  if (!process.env.DATABASE_URL) {
    return Response.json({ markedAbandoned: 0, remindersSent: 0 });
  }

  const T = schema;
  try {
    const cutoff = new Date(Date.now() - TWO_HOURS_MS);
    const abandonWhere = and(
      isNull(T.checkoutSessions.completedAt),
      isNull(T.checkoutSessions.abandonedAt),
      lt(T.checkoutSessions.startedAt, cutoff),
    );
    const toAbandon = await db.select({ id: T.checkoutSessions.id }).from(T.checkoutSessions).where(abandonWhere);
    if (toAbandon.length > 0) {
      await db.update(T.checkoutSessions).set({ abandonedAt: new Date() }).where(abandonWhere);
    }
    const markedAbandoned = toAbandon.length;

    const origin = new URL(req.url).origin;
    // Task fix/fx-rate-unify: the reminder's "(~X HTG)" line reflects the
    // CURRENT admin-set DB rate, not a build-time constant — GATED +
    // NEVER-THROW (lib/fx.ts), so this can't newly break the cron. Fetched
    // once per run (mirrors lib/payments/fulfill.ts's receipt-email path).
    const rateHtg = await getFxRate();
    let remindersSent = 0;
    const candidates = await db
      .select()
      .from(T.checkoutSessions)
      .where(
        and(
          isNotNull(T.checkoutSessions.abandonedAt),
          isNull(T.checkoutSessions.remindedAt),
          isNotNull(T.checkoutSessions.userId),
        ),
      );

    // GROUP BY BASKET (« panye »): an abandoned basket of N courses is N
    // checkout_sessions rows sharing a cartId — but ONE abandonment. Without
    // grouping, one abandoned basket fired N separate reminder emails, each
    // quoting one course's price, none quoting the total the buyer actually
    // saw. Rows without a cartId group alone (the pre-cart behaviour,
    // unchanged); the claim below is taken on EVERY row of a group, so
    // concurrent runs still can't double-send.
    const groups = new Map<string, typeof candidates>();
    for (const session of candidates) {
      const key = session.cartId ?? session.id;
      const bucket = groups.get(key);
      if (bucket) bucket.push(session);
      else groups.set(key, [session]);
    }

    for (const group of groups.values()) {
      const first = group[0];
      if (!first.userId) continue; // narrows for TS; isNotNull(userId) already guarantees this
      const [user] = await db.select().from(T.users).where(eq(T.users.id, first.userId)).limit(1);

      // Atomic claim on the whole group: only the run that successfully
      // UPDATEs remindedAt sends the email. Claiming every row (not just the
      // first) keeps re-runs from resurrecting the group's other rows.
      const ids = group.map((s) => s.id);
      const claimed = await db
        .update(T.checkoutSessions)
        .set({ remindedAt: new Date() })
        .where(and(inArray(T.checkoutSessions.id, ids), isNull(T.checkoutSessions.remindedAt)))
        .returning({ id: T.checkoutSessions.id });
      if (claimed.length === 0) continue; // a concurrent run already claimed this cart
      if (!user?.email) continue;

      const locale: 'fr' | 'ht' = user.localePref === 'fr' ? 'fr' : 'ht';
      // Stage 6: names via lib/courses/source (DB first, static fallback) —
      // the old static data/courses.ts map made every DB-created course fall
      // through to its raw slug. Subscription carts (teacher pass or Pass
      // PNICE — checkout_sessions stores no plan reference) keep the generic
      // subscription label. A BASKET is named « N fòmasyon » and its amount
      // is the TOTAL the buyer saw, resuming on /panye.
      const isBasket = group.length > 1;
      const course = !isBasket && first.courseSlug ? await getCourseBySlug(first.courseSlug) : undefined;
      const itemName = isBasket
        ? locale === 'fr'
          ? `${group.length} formations`
          : `${group.length} fòmasyon`
        : first.productType === 'subscription'
          ? locale === 'fr'
            ? 'Abonnement mensuel'
            : 'Abònman mansyèl'
          : (course ? (locale === 'fr' ? course.title_fr : course.title_ht) : (first.courseSlug ?? '—'));
      const resumeUrl = isBasket
        ? `${origin}/${locale}/panye`
        : first.productType === 'course' && first.courseSlug
          ? `${origin}/${locale}/checkout?course=${encodeURIComponent(first.courseSlug)}`
          : `${origin}/${locale}/checkout`;

      const { subject, html, text } = buildCartReminderHtml({
        locale,
        name: user.name,
        itemName,
        amountCents: group.reduce((a, s) => a + s.amountCents, 0),
        resumeUrl,
        rateHtg,
      });
      const result = await sendEmail({ to: user.email, subject, html, text });
      if (result.sent) remindersSent++;
    }

    return Response.json({ markedAbandoned, remindersSent });
  } catch (e) {
    console.error('[cron:abandoned-carts] failed:', e instanceof Error ? e.message : e);
    return Response.json({ markedAbandoned: 0, remindersSent: 0, error: 'processing_error' }, { status: 500 });
  }
}
