'use server';

/**
 * Site-content server actions (Phase C Lot 2): testimonials, places, texts,
 * legal, announcements. Content actions gated on `courses.edit`; the
 * announcement blast on `users.act`. `submitReviewAction` is PUBLIC (token-gated)
 * — it's called from the public testimonial form.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can, type Capability } from '@/lib/admin/permissions';
import { recordAudit, getUsers, type AdminActor } from '@/lib/admin/data';
import * as site from '@/lib/admin/site/ops';
import type { SiteTestimonial, PlacesConfig, LegalSlug } from '@/lib/admin/site/store';

export type SiteResult = { ok: boolean; message?: string; token?: string; count?: number };

async function requireCap(cap: Capability): Promise<AdminActor> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, cap)) throw new Error('forbidden');
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.emailAddresses[0]?.emailAddress || userId;
  return { id: userId, name };
}
function fail(e: unknown): SiteResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

/* ----------------------------- testimonials ------------------------------ */
export async function createTestimonialAction(input: site.NewTestimonial): Promise<SiteResult> {
  try {
    await requireCap('courses.edit');
    if (!input.name?.trim()) return { ok: false, message: 'name_required' };
    site.createTestimonial(input);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
export async function updateTestimonialAction(id: string, patch: Partial<SiteTestimonial>): Promise<SiteResult> {
  try {
    await requireCap('courses.edit');
    return { ok: site.updateTestimonial(id, patch) };
  } catch (e) {
    return fail(e);
  }
}
export async function deleteTestimonialAction(id: string): Promise<SiteResult> {
  try {
    await requireCap('courses.edit');
    return { ok: site.deleteTestimonial(id) };
  } catch (e) {
    return fail(e);
  }
}
export async function publishTestimonialAction(id: string): Promise<SiteResult> {
  try {
    await requireCap('courses.edit');
    const r = site.publishTestimonial(id);
    return { ok: r.ok, message: r.reason };
  } catch (e) {
    return fail(e);
  }
}
export async function unpublishTestimonialAction(id: string): Promise<SiteResult> {
  try {
    await requireCap('courses.edit');
    return { ok: site.unpublishTestimonial(id) };
  } catch (e) {
    return fail(e);
  }
}

/** Create a single-use review token for a learner (email is stubbed → returns the link). */
export async function requestTestimonialAction(userId: string, userName: string): Promise<SiteResult> {
  try {
    const actor = await requireCap('courses.edit');
    const tok = site.createReviewToken(userId, userName);
    // Production: email the user a link to /temoignage/{token} (Resend template).
    await recordAudit({ action: 'review_request', userId, admin: actor });
    return { ok: true, token: tok.token };
  } catch (e) {
    return fail(e);
  }
}

/** PUBLIC — the learner submits via the token form. No admin auth. */
export async function submitReviewAction(
  token: string,
  quote: string,
  lang: 'ht' | 'fr',
  photo: string | null,
): Promise<SiteResult> {
  try {
    if (!quote.trim()) return { ok: false, message: 'empty' };
    const r = site.submitReview(token, quote.trim(), lang, photo);
    return { ok: r.ok, message: r.reason };
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------- places --------------------------------- */
export async function setPlacesAction(patch: Partial<PlacesConfig>): Promise<SiteResult> {
  try {
    await requireCap('courses.edit');
    site.setPlaces(patch);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------------- text overrides ---------------------------- */
export async function setTextOverrideAction(key: string, ht: string, fr: string): Promise<SiteResult> {
  try {
    await requireCap('courses.edit');
    site.setTextOverride(key, ht, fr);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
export async function resetTextOverrideAction(key: string): Promise<SiteResult> {
  try {
    await requireCap('courses.edit');
    site.resetTextOverride(key);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- legal --------------------------------- */
export async function saveLegalAction(slug: LegalSlug, ht: string, fr: string): Promise<SiteResult> {
  try {
    const actor = await requireCap('courses.edit');
    return { ok: site.saveLegalVersion(slug, ht, fr, actor.name) };
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------------- announcements ----------------------------- */
export async function sendAnnouncementAction(input: {
  segment: 'all' | 'active_subscriber' | 'one_off' | 'free';
  subjectHt: string;
  subjectFr: string;
  bodyHt: string;
  bodyFr: string;
}): Promise<SiteResult> {
  try {
    const actor = await requireCap('users.act');
    if (!input.subjectFr.trim() || !input.bodyFr.trim()) return { ok: false, message: 'fields_required' };
    const page = await getUsers(input.segment === 'all' ? {} : { type: input.segment, pageSize: 1 });
    const count = page.total;
    // Production: enqueue the bilingual email to each recipient via Resend
    // (send the ht or fr version per user's language preference). Audited here.
    await recordAudit({ action: 'announcement', userId: actor.id, admin: actor, detail: `${input.segment}:${count}` });
    return { ok: true, count };
  } catch (e) {
    return fail(e);
  }
}
