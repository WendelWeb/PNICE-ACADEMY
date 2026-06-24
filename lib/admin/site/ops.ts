/**
 * Site-content operations — reads + mutations on the site store.
 * Server-side; called by the site server actions + read by the home/public pages.
 */
import { randomUUID } from 'crypto';
import {
  getSite,
  nextId,
  EDITABLE_TEXT_KEYS,
  type SiteTestimonial,
  type TestimonialStatus,
  type PlacesConfig,
  type LegalSlug,
  type ReviewToken,
} from './store';

const DAY = 86_400_000;

/* ----------------------------- testimonials ------------------------------ */
export type TestimonialQuery = { status?: TestimonialStatus; course?: string };

export function listTestimonials(q: TestimonialQuery = {}): SiteTestimonial[] {
  let rows = [...getSite().testimonials];
  if (q.status) rows = rows.filter((t) => t.status === q.status);
  if (q.course) rows = rows.filter((t) => t.courseSlug === q.course);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTestimonial(id: string): SiteTestimonial | null {
  return getSite().testimonials.find((t) => t.id === id) ?? null;
}

export type NewTestimonial = {
  name: string;
  location: string;
  courseSlug: string | null;
  quote_ht: string;
  quote_fr: string;
  photo: string | null;
};

export function createTestimonial(input: NewTestimonial): { id: string } {
  const id = nextId('tm');
  getSite().testimonials.push({ id, status: 'real', createdAt: new Date().toISOString(), ...input });
  return { id };
}

export function updateTestimonial(id: string, patch: Partial<SiteTestimonial>): boolean {
  const t = getTestimonial(id);
  if (!t) return false;
  // status is managed via publish/unpublish; placeholder can't be turned real here.
  const { status, ...rest } = patch;
  Object.assign(t, rest);
  return true;
}

export function deleteTestimonial(id: string): boolean {
  const s = getSite();
  const i = s.testimonials.findIndex((t) => t.id === id);
  if (i < 0) return false;
  s.testimonials.splice(i, 1);
  return true;
}

export function canPublishTestimonial(t: SiteTestimonial): boolean {
  return t.status !== 'placeholder' && !!t.quote_ht.trim() && !!t.quote_fr.trim();
}

export function publishTestimonial(id: string): { ok: boolean; reason?: string } {
  const t = getTestimonial(id);
  if (!t) return { ok: false, reason: 'not_found' };
  if (t.status === 'placeholder') return { ok: false, reason: 'placeholder' };
  if (!canPublishTestimonial(t)) return { ok: false, reason: 'incomplete' };
  t.status = 'published';
  return { ok: true };
}

export function unpublishTestimonial(id: string): boolean {
  const t = getTestimonial(id);
  if (!t || t.status === 'placeholder') return false;
  t.status = 'real';
  return true;
}

/** For the public home: published real ones, else the example placeholders. */
export function getHomeTestimonials(): SiteTestimonial[] {
  const published = getSite().testimonials.filter((t) => t.status === 'published');
  return published.length ? published : getSite().testimonials.filter((t) => t.status === 'placeholder');
}

/* -------------------------------- places --------------------------------- */
export function getPlaces(): PlacesConfig {
  return getSite().places;
}
export function setPlaces(patch: Partial<PlacesConfig>): void {
  Object.assign(getSite().places, patch);
}
/** Seats left for the home banner, or null if disabled. */
export function getSeatsLeft(): number | null {
  const p = getSite().places;
  return p.enabled ? Math.max(0, p.total - p.taken) : null;
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
export function getLegal(slug: LegalSlug) {
  return getSite().legal.find((l) => l.slug === slug) ?? null;
}
export function saveLegalVersion(slug: LegalSlug, content_ht: string, content_fr: string, adminName: string): boolean {
  const page = getLegal(slug);
  if (!page) return false;
  page.versions.unshift({ content_ht, content_fr, updatedAt: new Date().toISOString(), adminName });
  page.versions = page.versions.slice(0, 5); // keep last 5
  return true;
}

/* ----------------------------- review tokens ----------------------------- */
export function createReviewToken(userId: string, userName: string): ReviewToken {
  const token: ReviewToken = {
    token: randomUUID(),
    userId,
    userName,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    used: false,
  };
  getSite().tokens.push(token);
  return token;
}
export function getReviewToken(token: string): ReviewToken | null {
  return getSite().tokens.find((t) => t.token === token) ?? null;
}
export function isTokenValid(t: ReviewToken | null): boolean {
  return !!t && !t.used && Date.parse(t.expiresAt) > Date.now();
}
export function submitReview(token: string, quote: string, lang: 'ht' | 'fr', photo: string | null): { ok: boolean; reason?: string } {
  const t = getReviewToken(token);
  if (!isTokenValid(t)) return { ok: false, reason: 'invalid' };
  createTestimonial({
    name: t!.userName,
    location: '',
    courseSlug: null,
    quote_ht: lang === 'ht' ? quote : '',
    quote_fr: lang === 'fr' ? quote : '',
    photo,
  });
  t!.used = true;
  return { ok: true };
}
