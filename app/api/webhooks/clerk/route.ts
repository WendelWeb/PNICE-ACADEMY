/**
 * Clerk user-sync webhook (Phase D Lot 3). Keeps the `users` table in sync with
 * Clerk: user.created/updated → upsert, user.deleted → REDACT (never delete —
 * see `redactDeletedUser`: the money rows cascade off this table).
 *
 * Signature is verified with the Svix scheme using Node crypto (no svix dep).
 * Env-gated: returns 503 until both CLERK_WEBHOOK_SECRET and DATABASE_URL are
 * set, so the route is safe to ship before the backend is wired.
 *
 * Setup: Clerk Dashboard → Webhooks → add endpoint `/api/webhooks/clerk`,
 * subscribe to user.created/updated/deleted, copy the signing secret into
 * CLERK_WEBHOOK_SECRET.
 */
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mapClerkUserToDbUser, type ClerkWebhookUser } from '@/lib/clerkUserSync';
import { sendEmail } from '@/lib/email/resend';
import { buildWelcomeHtml } from '@/lib/email/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Delete my account" — forget the PERSON, keep the accounting.
 *
 * This used to be `DELETE FROM users`, and every money table references
 * `users.id` with ON DELETE CASCADE: one learner clicking « Efase kont mwen »
 * silently erased their payments, the teacher's matching earnings line, and
 * any sale a future refund would need to reverse. Revenue shrank with nothing
 * to show why.
 *
 * So the row stays and the person goes:
 *   - `clerk_id` becomes a `deleted:<old id>` tombstone. It keeps the UNIQUE
 *     constraint satisfied without a nullable-column migration, and it can
 *     never again match a live Clerk session — every access lookup goes
 *     through `clerk_id`, so the account is genuinely unusable.
 *   - e-mail becomes a per-row address under `.invalid`, the TLD RFC 2606
 *     reserves precisely so it can never resolve or receive mail.
 *   - name, certificate name, phone, country and city are cleared outright.
 *   - `deleted_at` records when, so the admin console can tell an anonymous
 *     row from an active one.
 *
 * Idempotent: Clerk retries webhooks, and a second delivery matches nothing
 * (the tombstone no longer equals the incoming id), so it is a silent no-op.
 */
async function redactDeletedUser(clerkId: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkId))
    .limit(1);
  if (!row) return;

  await db
    .update(schema.users)
    .set({
      clerkId: `deleted:${clerkId}`,
      email: `deleted+${row.id}@pniceacademy.invalid`,
      name: null,
      certificateName: null,
      phone: null,
      country: null,
      city: null,
      deletedAt: new Date(),
    })
    .where(eq(schema.users.id, row.id));
}

function verifySvix(secret: string, id: string | null, ts: string | null, sigHeader: string | null, body: string): boolean {
  if (!id || !ts || !sigHeader) return false;
  // Reject timestamps more than 5 minutes off (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  const expectedBuf = Buffer.from(expected);
  // Header form: "v1,<sig> v1,<sig2> ...".
  return sigHeader.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

// Payload shape + upsert mapping now live in lib/clerkUserSync.ts (pure,
// unit-tested) — Stage: learner account, which also syncs the /kont-chosen
// certificateName from unsafe_metadata on user.updated.
type ClerkUser = ClerkWebhookUser;

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response('webhook not configured', { status: 503 });
  if (!process.env.DATABASE_URL) return new Response('database not configured', { status: 503 });

  const body = await req.text();
  const ok = verifySvix(
    secret,
    req.headers.get('svix-id'),
    req.headers.get('svix-timestamp'),
    req.headers.get('svix-signature'),
    body,
  );
  if (!ok) return new Response('invalid signature', { status: 400 });

  let evt: { type: string; data: ClerkUser };
  try {
    evt = JSON.parse(body);
  } catch {
    return new Response('bad payload', { status: 400 });
  }

  const data = evt.data;
  try {
    if (evt.type === 'user.created' || evt.type === 'user.updated') {
      const { values, set } = mapClerkUserToDbUser(data);
      await db
        .insert(schema.users)
        .values(values)
        .onConflictDoUpdate({ target: schema.users.clerkId, set });

      // Stage 6: learner welcome — ONLY on user.created (an update must never
      // re-welcome). A brand-new account has no locale preference yet, so
      // the platform default (ht) applies. NEVER THROWS: sendEmail is
      // env-gated + never-throws, and the whole step is wrapped so an email
      // hiccup can't 500 the webhook (which would make Clerk redeliver).
      if (evt.type === 'user.created' && values.email) {
        try {
          const welcome = buildWelcomeHtml({ locale: 'ht', name: values.name || null });
          await sendEmail({ to: values.email, subject: welcome.subject, html: welcome.html, text: welcome.text });
        } catch (err) {
          console.error('[webhook:clerk] welcome email failed (user already synced):', err);
        }
      }
    } else if (evt.type === 'user.deleted') {
      if (data.id) await redactDeletedUser(data.id);
    }
    // Other event types are acknowledged and ignored.
    return new Response('ok', { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return new Response(`processing error: ${msg}`, { status: 500 });
  }
}
