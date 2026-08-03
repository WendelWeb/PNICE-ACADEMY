/**
 * Site-content store: testimonials, text overrides, legal pages, and
 * testimonial-request tokens.
 *
 * Stage: durable site content — this store is now DB-FIRST (migration 0017:
 * site_legal_pages / site_testimonials / site_review_tokens). The in-memory
 * module cache that used to hold everything (and evaporated per deploy,
 * diverging per serverless instance) is demoted to exactly two jobs:
 *   (a) the no-DB fallback — with no DATABASE_URL the whole store still works
 *       in-memory (ephemeral, as before), so dev/build/mock never break;
 *   (b) a SHORT-LIVED read cache over the DB (READ_TTL_MS) so the home page /
 *       footer / legal pages don't re-query per render burst. Every write
 *       busts it, so an admin's save shows up on their very next read.
 * NEVER-THROW on reads: a failed DB query falls back to the in-memory store
 * (and, for legal pages, to data/legal.ts's code-shipped defaults) — same
 * division of labour as lib/fx.ts's getFxRate. Writes MAY throw with a DB
 * configured (the 'use server' actions in lib/admin/site-actions.ts already
 * wrap every call and surface a failure message), mirroring setFxRate.
 *
 * LEGAL DEFAULTS: getLegal-level reads fold in data/legal.ts PER LANGUAGE —
 * a blank stored language renders the complete code default instead, so a
 * site that takes payments never shows an empty CGU/privacy/refund page.
 *
 * Testimonials carry an explicit status — `placeholder` seed data can NEVER
 * be published (enforced in ops + UI) per the "never publish fake
 * testimonials" rule. Placeholders are VIRTUAL code-side rows
 * (data/testimonials.ts): they are never written to the DB.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured } from '@/lib/courses/source';
import { testimonials as seedTestimonials } from '@/data/testimonials';
import { LEGAL_DEFAULTS, LEGAL_DEFAULTS_UPDATED_AT } from '@/data/legal';

const T = schema;

export type TestimonialStatus = 'placeholder' | 'real' | 'published';

export type SiteTestimonial = {
  id: string;
  name: string;
  location: string;
  courseSlug: string | null;
  quote_ht: string;
  quote_fr: string;
  photo: string | null;
  status: TestimonialStatus;
  createdAt: string;
};

export type LegalSlug = 'cgu' | 'confidentialite' | 'remboursement';
export type LegalVersion = { content_ht: string; content_fr: string; updatedAt: string; adminName: string };
export type LegalPage = { slug: LegalSlug; versions: LegalVersion[] }; // versions[0] = current

export type ReviewToken = {
  token: string;
  userId: string;
  userName: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
};

/** Curated, editable translation keys (create/delete stays a code operation). */
export const EDITABLE_TEXT_KEYS: { section: string; keys: string[] }[] = [
  { section: 'hero', keys: ['home.hero.title', 'home.hero.subtitle', 'home.hero.ctaPrimary', 'home.hero.ctaSecondary'] },
  { section: 'nav', keys: ['nav.formations', 'nav.pricing', 'nav.login', 'nav.cta'] },
  { section: 'catalog', keys: ['home.testimonials.title', 'home.testimonials.eyebrow'] },
];

type Store = {
  testimonials: SiteTestimonial[];
  textOverrides: Record<string, { ht: string; fr: string }>;
  legal: LegalPage[];
  tokens: ReviewToken[];
};

let cache: Store | null = null;
let seq = 0;
export function nextId(prefix: string): string {
  seq++;
  return `${prefix}_${seq.toString().padStart(4, '0')}`;
}

function seedLegal(slug: LegalSlug): LegalPage {
  return {
    slug,
    versions: [
      {
        content_ht: '',
        content_fr: '',
        updatedAt: new Date().toISOString(),
        adminName: 'seed',
      },
    ],
  };
}

/** The virtual, code-side placeholder rows — never persisted, never publishable. */
function placeholderRows(): SiteTestimonial[] {
  return seedTestimonials.map((t) => ({
    id: t.id,
    name: t.name,
    location: t.location,
    courseSlug: null,
    quote_ht: t.quote_ht,
    quote_fr: t.quote_fr,
    photo: t.avatar,
    status: 'placeholder' as const,
    createdAt: new Date(0).toISOString(),
  }));
}

/** The in-memory store — no-DB fallback + the only home of text overrides. */
export function getSite(): Store {
  if (cache) return cache;
  cache = {
    testimonials: placeholderRows(),
    textOverrides: {},
    legal: [seedLegal('cgu'), seedLegal('confidentialite'), seedLegal('remboursement')],
    tokens: [],
  };
  return cache;
}

/* ------------------------- short-lived DB read cache ---------------------- */
const READ_TTL_MS = 15_000;

type DbReadCache = {
  testimonialsAt: number;
  testimonials: SiteTestimonial[] | null;
  legalAt: number;
  legal: Map<LegalSlug, LegalVersion | null> | null;
};
let dbRead: DbReadCache = { testimonialsAt: 0, testimonials: null, legalAt: 0, legal: null };

/** Every write path calls this so the writer's next read is fresh. */
export function bustSiteReadCache(): void {
  dbRead = { testimonialsAt: 0, testimonials: null, legalAt: 0, legal: null };
}

/* ------------------------------ testimonials ------------------------------ */

function rowToTestimonial(r: typeof T.siteTestimonials.$inferSelect): SiteTestimonial {
  return {
    id: r.id,
    name: r.name,
    location: r.location,
    courseSlug: r.courseSlug,
    quote_ht: r.quoteHt,
    quote_fr: r.quoteFr,
    photo: r.photo,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * All testimonials: DB rows (real/published) plus the virtual code-side
 * placeholders. NEVER-THROW: no DB / failed query ⇒ the in-memory store.
 */
export async function loadTestimonials(): Promise<SiteTestimonial[]> {
  if (!dbConfigured()) return getSite().testimonials;
  const now = Date.now();
  if (dbRead.testimonials && now - dbRead.testimonialsAt < READ_TTL_MS) {
    return dbRead.testimonials;
  }
  try {
    const rows = await db.select().from(T.siteTestimonials);
    const all = [...rows.map(rowToTestimonial), ...placeholderRows()];
    dbRead.testimonials = all;
    dbRead.testimonialsAt = now;
    return all;
  } catch (err) {
    console.error('[site] loadTestimonials DB read failed, falling back to memory:', err);
    return getSite().testimonials;
  }
}

export async function insertTestimonial(t: SiteTestimonial): Promise<void> {
  if (!dbConfigured()) {
    getSite().testimonials.push(t);
    return;
  }
  await db.insert(T.siteTestimonials).values({
    id: t.id,
    name: t.name,
    location: t.location,
    courseSlug: t.courseSlug,
    quoteHt: t.quote_ht,
    quoteFr: t.quote_fr,
    photo: t.photo,
    status: t.status === 'published' ? 'published' : 'real',
  });
  bustSiteReadCache();
}

/** Field/status patch by id. Virtual placeholders are untouchable in DB mode. */
export async function patchTestimonial(
  id: string,
  patch: Partial<Omit<SiteTestimonial, 'id' | 'createdAt'>>,
): Promise<boolean> {
  if (!dbConfigured()) {
    const t = getSite().testimonials.find((x) => x.id === id);
    if (!t) return false;
    Object.assign(t, patch);
    return true;
  }
  const set: Partial<typeof T.siteTestimonials.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.location !== undefined) set.location = patch.location;
  if (patch.courseSlug !== undefined) set.courseSlug = patch.courseSlug;
  if (patch.quote_ht !== undefined) set.quoteHt = patch.quote_ht;
  if (patch.quote_fr !== undefined) set.quoteFr = patch.quote_fr;
  if (patch.photo !== undefined) set.photo = patch.photo;
  if (patch.status !== undefined && patch.status !== 'placeholder') set.status = patch.status;
  if (Object.keys(set).length === 0) return true;
  const updated = await db
    .update(T.siteTestimonials)
    .set(set)
    .where(eq(T.siteTestimonials.id, id))
    .returning({ id: T.siteTestimonials.id });
  bustSiteReadCache();
  return updated.length > 0;
}

export async function removeTestimonial(id: string): Promise<boolean> {
  if (!dbConfigured()) {
    const s = getSite();
    const i = s.testimonials.findIndex((t) => t.id === id);
    if (i < 0) return false;
    s.testimonials.splice(i, 1);
    return true;
  }
  const deleted = await db
    .delete(T.siteTestimonials)
    .where(eq(T.siteTestimonials.id, id))
    .returning({ id: T.siteTestimonials.id });
  bustSiteReadCache();
  return deleted.length > 0;
}

/* --------------------------------- legal ---------------------------------- */

/**
 * Fold the code-shipped default (data/legal.ts) into a stored version PER
 * LANGUAGE: a blank stored language renders the complete default instead.
 */
function foldLegalDefaults(slug: LegalSlug, stored: LegalVersion | null): LegalVersion {
  const d = LEGAL_DEFAULTS[slug];
  const hasHt = !!stored?.content_ht.trim();
  const hasFr = !!stored?.content_fr.trim();
  if (!stored || (!hasHt && !hasFr)) {
    return {
      content_ht: d.content_ht,
      content_fr: d.content_fr,
      updatedAt: LEGAL_DEFAULTS_UPDATED_AT,
      adminName: 'PNICE Academy',
    };
  }
  return {
    content_ht: hasHt ? stored.content_ht : d.content_ht,
    content_fr: hasFr ? stored.content_fr : d.content_fr,
    updatedAt: stored.updatedAt,
    adminName: stored.adminName,
  };
}

/**
 * The current legal page for a slug — DB content if non-empty, else the
 * data/legal.ts default (per language). NEVER-THROW: no DB / failed query ⇒
 * the in-memory version (which folds the same defaults).
 */
export async function loadLegal(slug: LegalSlug): Promise<LegalPage> {
  if (!dbConfigured()) {
    const page = getSite().legal.find((l) => l.slug === slug) ?? seedLegal(slug);
    return { slug, versions: [foldLegalDefaults(slug, page.versions[0] ?? null), ...page.versions.slice(1)] };
  }
  const now = Date.now();
  if (!dbRead.legal || now - dbRead.legalAt >= READ_TTL_MS) {
    try {
      const rows = await db.select().from(T.siteLegalPages);
      const map = new Map<LegalSlug, LegalVersion | null>();
      for (const r of rows) {
        map.set(r.slug, {
          content_ht: r.contentHt,
          content_fr: r.contentFr,
          updatedAt: r.updatedAt.toISOString(),
          adminName: r.adminName,
        });
      }
      dbRead.legal = map;
      dbRead.legalAt = now;
    } catch (err) {
      console.error('[site] loadLegal DB read failed, falling back to defaults:', err);
      return { slug, versions: [foldLegalDefaults(slug, null)] };
    }
  }
  return { slug, versions: [foldLegalDefaults(slug, dbRead.legal.get(slug) ?? null)] };
}

/** Upsert the CURRENT version of a legal page (one row per slug). */
export async function storeLegal(
  slug: LegalSlug,
  content_ht: string,
  content_fr: string,
  adminName: string,
): Promise<boolean> {
  if (!dbConfigured()) {
    const page = getSite().legal.find((l) => l.slug === slug);
    if (!page) return false;
    page.versions.unshift({ content_ht, content_fr, updatedAt: new Date().toISOString(), adminName });
    page.versions = page.versions.slice(0, 5); // keep last 5
    return true;
  }
  await db
    .insert(T.siteLegalPages)
    .values({ slug, contentHt: content_ht, contentFr: content_fr, adminName })
    .onConflictDoUpdate({
      target: T.siteLegalPages.slug,
      set: { contentHt: content_ht, contentFr: content_fr, adminName, updatedAt: new Date() },
    });
  bustSiteReadCache();
  return true;
}

/* ----------------------------- review tokens ------------------------------ */

/** Tokens are single-use, so they are NEVER served from the read cache. */
export async function loadToken(token: string): Promise<ReviewToken | null> {
  if (!dbConfigured()) return getSite().tokens.find((t) => t.token === token) ?? null;
  try {
    const [row] = await db
      .select()
      .from(T.siteReviewTokens)
      .where(eq(T.siteReviewTokens.token, token))
      .limit(1);
    if (!row) return null;
    return {
      token: row.token,
      userId: row.userId,
      userName: row.userName,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      used: row.used,
    };
  } catch (err) {
    console.error('[site] loadToken DB read failed:', err);
    return null;
  }
}

export async function insertToken(t: ReviewToken): Promise<void> {
  if (!dbConfigured()) {
    getSite().tokens.push(t);
    return;
  }
  await db.insert(T.siteReviewTokens).values({
    token: t.token,
    userId: t.userId,
    userName: t.userName,
    expiresAt: new Date(t.expiresAt),
  });
}

export async function markTokenUsed(token: string): Promise<void> {
  if (!dbConfigured()) {
    const t = getSite().tokens.find((x) => x.token === token);
    if (t) t.used = true;
    return;
  }
  await db.update(T.siteReviewTokens).set({ used: true }).where(eq(T.siteReviewTokens.token, token));
}
