'use server';

/**
 * Public-site server actions (U3 — marketplace repositioning). Separate from
 * lib/admin/support-actions.ts because these are learner-facing, unauthenticated-
 * safe entry points — not admin mutations.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createTicket, getTickets } from '@/lib/admin/data';
import { resolveUserId } from '@/lib/learner/access';

export type SiteActionResult = { ok: boolean; message?: string; id?: string };

/**
 * A signed-in learner registers interest in becoming a teacher (home
 * `TeachTeaser` + the future `/enseigner` page — same capture, per the plan).
 * No teacher marketplace exists yet, so this simply files a ticket that
 * surfaces in the admin support inbox via the existing Phase D Lot 2
 * data-layer contract (`createTicket`, type 'other') — zero schema change.
 * Mirrors `submitSupportTicketAction`'s auth pattern; signed-out visitors
 * never reach this (the UI gates them behind the sign-up modal instead).
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
