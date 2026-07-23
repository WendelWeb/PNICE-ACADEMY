'use server';

/**
 * Public-site server actions (U3 — marketplace repositioning). Separate from
 * lib/admin/support-actions.ts because these are learner-facing, unauthenticated-
 * safe entry points — not admin mutations.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createTicket } from '@/lib/admin/data';

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
