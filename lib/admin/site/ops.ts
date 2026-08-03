/**
 * Site-content operations — reads + mutations on the site store.
 * Server-side; called by the site server actions + read by the home/public
 * pages.
 *
 * Stage: durable site content — the store underneath (./store.ts) is now
 * DB-first (migration 0017), so everything that touches testimonials, legal
 * pages or review tokens is async. Same exported function names + parameters
 * as before (no import changes anywhere); callers now `await`. Text
 * overrides stay the sync, in-memory curated list they always were (no DB
 * table for them in this stage).
 */
import { randomUUID } from 'crypto';
import {
  getSite,
  nextId,
  EDITABLE_TEXT_KEYS,
  loadTestimonials,
  insertTestimonial,
  patchTestimonial,
  removeTestimonial,
  loadLegal,
  storeLegal,
  loadToken,
  insertToken,
  markTokenUsed,
  type SiteTestimonial,
  type TestimonialStatus,
  type LegalSlug,
  type ReviewToken,
} from './store';
import { dbConfigured } from '@/lib/courses/source';

const DAY = 86_400_000;

/* ----------------------------- testimonials ------------------------------ */
export type TestimonialQuery = { status?: TestimonialStatus; course?: string };

export async function listTestimonials(q: TestimonialQuery = {}): Promise<SiteTestimonial[]> {
  let rows = [...(await loadTestimonials())];
  if (q.status) rows = rows.filter((t) => t.status === q.status);
  if (q.course) rows = rows.filter((t) => t.courseSlug === q.course);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTestimonial(id: string): Promise<SiteTestimonial | null> {
  return (await loadTestimonials()).find((t) => t.id === id) ?? null;
}

export type NewTestimonial = {
  name: string;
  location: string;
  courseSlug: string | null;
  quote_ht: string;
  quote_fr: string;
  photo: string | null;
};

export async function createTestimonial(input: NewTestimonial): Promise<{ id: string }> {
  const id = dbConfigured() ? `tm_${randomUUID()}` : nextId('tm');
  await insertTestimonial({ id, status: 'real', createdAt: new Date().toISOString(), ...input });
  return { id };
}

export async function updateTestimonial(id: string, patch: Partial<SiteTestimonial>): Promise<boolean> {
  // status is managed via publish/unpublish; placeholder can't be turned real here.
  const { status, id: _id, createdAt, ...rest } = patch;
  return patchTestimonial(id, rest);
}

export async function deleteTestimonial(id: string): Promise<boolean> {
  return removeTestimonial(id);
}

export function canPublishTestimonial(t: SiteTestimonial): boolean {
  return t.status !== 'placeholder' && !!t.quote_ht.trim() && !!t.quote_fr.trim();
}

export async function publishTestimonial(id: string): Promise<{ ok: boolean; reason?: string }> {
  const t = await getTestimonial(id);
  if (!t) return { ok: false, reason: 'not_found' };
  if (t.status === 'placeholder') return { ok: false, reason: 'placeholder' };
  if (!canPublishTestimonial(t)) return { ok: false, reason: 'incomplete' };
  await patchTestimonial(id, { status: 'published' });
  return { ok: true };
}

export async function unpublishTestimonial(id: string): Promise<boolean> {
  const t = await getTestimonial(id);
  if (!t || t.status === 'placeholder') return false;
  return patchTestimonial(id, { status: 'real' });
}

/**
 * For the public home: PUBLISHED testimonials only (Stage: the living
 * manifest — the homepage states only what is real). Zero published ⇒ `[]`
 * and the section renders nothing; the code-side placeholder personas stay
 * admin-only material (visible in /admin/temoignages as unpublishable
 * examples) and never reach a public surface again.
 */
export async function getHomeTestimonials(): Promise<SiteTestimonial[]> {
  return (await loadTestimonials()).filter((t) => t.status === 'published');
}

/**
 * A single published testimonial for a course's sales page, if one exists.
 * Placeholders never qualify (never presented as real proof) — the section
 * is omitted entirely when no real, published match exists.
 */
export async function getCourseTestimonial(courseSlug: string): Promise<SiteTestimonial | null> {
  return (await listTestimonials({ status: 'published', course: courseSlug }))[0] ?? null;
}

/* ----------------------------- text overrides ---------------------------- */
export function getEditableTexts(
  baseHt: Record<string, unknown>,
  baseFr: Record<string, unknown>,
): { section: string; key: string; baseHt: string; baseFr: string; ht: string; fr: string; overridden: boolean }[] {
  const ov = getSite().textOverrides;
  const out: ReturnType<typeof getEditableTexts> = [];
  for (const group of EDITABLE_TEXT_KEYS) {
    for (const key of group.keys) {
      const bh = String(getByPath(baseHt, key) ?? '');
      const bf = String(getByPath(baseFr, key) ?? '');
      const o = ov[key];
      out.push({
        section: group.section,
        key,
        baseHt: bh,
        baseFr: bf,
        ht: o?.ht ?? bh,
        fr: o?.fr ?? bf,
        overridden: !!o,
      });
    }
  }
  return out;
}

export function setTextOverride(key: string, ht: string, fr: string): void {
  getSite().textOverrides[key] = { ht, fr };
}
export function resetTextOverride(key: string): void {
  delete getSite().textOverrides[key];
}

/** Merge overrides into a messages tree (used by i18n/request). Returns a copy. */
export function applyTextOverrides(messages: Record<string, unknown>, locale: 'ht' | 'fr'): Record<string, unknown> {
  const ov = getSite().textOverrides;
  if (Object.keys(ov).length === 0) return messages;
  const copy = structuredClone(messages);
  for (const [key, val] of Object.entries(ov)) {
    setByPath(copy, key, locale === 'ht' ? val.ht : val.fr);
  }
  return copy;
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}
function setByPath(obj: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/* --------------------------------- legal --------------------------------- */
/**
 * The current legal page: DB content saved from /admin/contenu when
 * non-empty (per language), else the complete data/legal.ts code default —
 * so /legal/[slug] never renders an empty policy on a site that takes
 * payments. Never null for a known slug; kept nullable for the frozen
 * call-site contract (`getLegal(slug)!` keeps compiling).
 */
export async function getLegal(slug: LegalSlug) {
  return (await loadLegal(slug)) ?? null;
}

export async function saveLegalVersion(
  slug: LegalSlug,
  content_ht: string,
  content_fr: string,
  adminName: string,
): Promise<boolean> {
  return storeLegal(slug, content_ht, content_fr, adminName);
}

/* ----------------------------- review tokens ----------------------------- */
export async function createReviewToken(userId: string, userName: string): Promise<ReviewToken> {
  const token: ReviewToken = {
    token: randomUUID(),
    userId,
    userName,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    used: false,
  };
  await insertToken(token);
  return token;
}
export async function getReviewToken(token: string): Promise<ReviewToken | null> {
  return loadToken(token);
}
export function isTokenValid(t: ReviewToken | null): boolean {
  return !!t && !t.used && Date.parse(t.expiresAt) > Date.now();
}
export async function submitReview(
  token: string,
  quote: string,
  lang: 'ht' | 'fr',
  photo: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const t = await getReviewToken(token);
  if (!isTokenValid(t)) return { ok: false, reason: 'invalid' };
  await createTestimonial({
    name: t!.userName,
    location: '',
    courseSlug: null,
    quote_ht: lang === 'ht' ? quote : '',
    quote_fr: lang === 'fr' ? quote : '',
    photo,
  });
  await markTokenUsed(token);
  return { ok: true };
}
