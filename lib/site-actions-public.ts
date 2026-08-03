'use server';

/**
 * Public-site server actions (U3 — marketplace repositioning). Separate from
 * lib/admin/support-actions.ts because these are learner-facing, unauthenticated-
 * safe entry points — not admin mutations.
 */
import { headers } from 'next/headers';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db, schema } from '@/db';
import { clerkEnabled } from '@/lib/clerk';
import { createTicket, getTickets } from '@/lib/admin/data';
import { resolveUserId } from '@/lib/learner/access';
import { allowContactSubmission } from '@/lib/site/contact-rate-limit';

export type SiteActionResult = { ok: boolean; message?: string; id?: string };

/**
 * A signed-in learner registers interest in becoming a teacher. Filed a
 * ticket in the admin support inbox via the existing Phase D Lot 2
 * data-layer contract (`createTicket`, type 'other') — zero schema change.
 *
 * SUPERSEDED for signed-in users by Task C3-T2: real applications are open
 * now (`lib/teacher/actions.ts`'s `applyAsTeacherAction`, wired through
 * `/enseigner`'s wizard), so `components/home/TeachInterestCta.tsx` no
 * longer calls this — it just links signed-in visitors to /enseigner
 * instead. Left in place (unused today) rather than deleted: it's a small,
 * working, independently-testable function, and removing it isn't part of
 * this task's scope. Mirrors `submitSupportTicketAction`'s auth pattern;
 * signed-out visitors never reached this (the UI gated them behind the
 * sign-up modal instead).
 */
export async function registerTeachInterestAction(): Promise<SiteActionResult> {
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, message: 'unauthorized' };
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username ||
      'Utilisateur';
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      '—';

    // Check for existing open "Enterese anseye" ticket to prevent duplicates.
    // createTicket (real mode) resolves the Clerk id to the internal users.id
    // before storing it (see lib/admin/data/real/support.ts note 1), so
    // TicketRow.userId is that internal id, not the raw Clerk id — resolve it
    // the same way before comparing. In mock mode resolveUserId has no real
    // users table to match against and returns null, so this falls back to
    // comparing the raw Clerk id, exactly like the mock's own createTicket
    // (which stores the Clerk id as-is).
    const internal = await resolveUserId(userId);
    const existingTicketsPage = await getTickets({
      type: 'other',
      pageSize: 100,
    });
    const existingTicket = existingTicketsPage.rows.find(
      (row) => row.userId === (internal ?? userId) && row.status !== 'resolved'
    );
    if (existingTicket) {
      // Idempotent success: ticket already exists for this user
      return { ok: true, id: existingTicket.id };
    }

    const r = await createTicket({
      userId,
      userName: name,
      userEmail: email,
      type: 'other',
      subject: 'Enterese anseye',
      message: `${name} klike sou « Mwen enterese » nan seksyon Anseye a sou paj akèy la — li vle vin anseyan sou PNICE Academy.`,
    });
    return { ok: true, id: r.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'error' };
  }
}

export type ContactMessageInput = {
  name: string;
  email: string;
  message: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The public /kontak form (Stage 4) — files the visitor's message as a
 * support ticket through the EXISTING data-layer contract (`createTicket`,
 * type 'other'), exactly like the other public entry points here. Works for
 * ANONYMOUS visitors: a signed-in user's ticket resolves via their Clerk id
 * as usual; a signed-out visitor's uses their supplied email as the external
 * id — `resolveOrCreateUserId` (lib/admin/data/real/support.ts, note 1)
 * self-heals a `users` row from the supplied name/email, the same upsert
 * shape the Clerk webhook performs, so the ticket satisfies the uuid FK and
 * repeat messages from the same address land on the same row.
 *
 * RATE-LIMITED per IP (x-forwarded-for's first hop) via
 * lib/site/contact-rate-limit.ts — in-memory and PER-INSTANCE by design; see
 * that module's honest-limitation header. Refused calls return
 * `message: 'rate_limited'` for the form's friendly copy.
 *
 * Never throws; input is trimmed, validated, and length-capped so a
 * malformed or mischievous submission degrades to `{ ok: false }`.
 */
export async function submitContactMessageAction(
  input: ContactMessageInput,
): Promise<SiteActionResult> {
  try {
    const name = (input.name ?? '').trim().slice(0, 120);
    const email = (input.email ?? '').trim().slice(0, 200);
    const message = (input.message ?? '').trim().slice(0, 4000);
    if (!name || !EMAIL_RE.test(email) || message.length < 5) {
      return { ok: false, message: 'invalid' };
    }

    const ip =
      headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!allowContactSubmission(ip)) {
      return { ok: false, message: 'rate_limited' };
    }

    // Signed-in visitors keep their real identity resolution; anonymous ones
    // are keyed by the email they supplied (see the doc comment above).
    const { userId: clerkId } = clerkEnabled ? await auth() : { userId: null };

    const r = await createTicket({
      userId: clerkId ?? email,
      userName: name,
      userEmail: email,
      type: 'other',
      subject: `Mesaj kontak — ${name}`,
      message,
    });
    return { ok: true, id: r.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'error' };
  }
}

export type CaptureUtmInput = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
};

/** UTM params come straight from the URL — trim, drop empties, cap length so
 *  a mischievous or malformed query string can't write an unbounded string. */
function cleanUtm(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s ? s.slice(0, 200) : null;
}

/**
 * Persists FIRST-TOUCH UTM attribution for the signed-in user (Task L5).
 * Called by the client capture hook (components/UtmCapture.tsx, mounted in
 * the (site) layout) once, right after the very first sign-in of a browsing
 * session that landed with `?utm_source/medium/campaign` in the URL.
 *
 * "First touch wins" is enforced at the DB level, not just by the client's
 * one-shot guard: `user_acquisition.user_id` is unique
 * (db/schema.ts), so `onConflictDoNothing` makes a second capture for the
 * same user (a different tab, a later campaign click, a retried call) a
 * true no-op — the very first row ever written for that user survives.
 *
 * Env-gated on DATABASE_URL (mirrors lib/learner/access.ts's dbReady()) and
 * on Clerk being configured; never throws — a failure here must never break
 * the page that triggered it.
 */
export async function captureUtmAction(utm: CaptureUtmInput): Promise<SiteActionResult> {
  if (!process.env.DATABASE_URL) return { ok: false, message: 'not_configured' };
  try {
    const { userId: clerkId } = clerkEnabled ? await auth() : { userId: null };
    if (!clerkId) return { ok: false, message: 'unauthorized' };

    const source = cleanUtm(utm.source);
    const medium = cleanUtm(utm.medium);
    const campaign = cleanUtm(utm.campaign);
    if (!source && !medium && !campaign) return { ok: true, message: 'no_utm' };

    const userId = await resolveUserId(clerkId);
    if (!userId) return { ok: false, message: 'no_user' };

    await db
      .insert(schema.userAcquisition)
      .values({ userId, utmSource: source, utmMedium: medium, utmCampaign: campaign })
      .onConflictDoNothing({ target: schema.userAcquisition.userId });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'error' };
  }
}
