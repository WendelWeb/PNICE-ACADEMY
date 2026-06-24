/**
 * Site-content store (Phase C Lot 2): testimonials, seats counter, text
 * overrides, legal pages, and testimonial-request tokens. Mutable in-memory,
 * seeded from data/testimonials.ts. Replaced by the DB later.
 *
 * Testimonials carry an explicit status — `placeholder` seed data can NEVER be
 * published (enforced in ops + UI) per the "never publish fake testimonials" rule.
 */
import { testimonials as seedTestimonials, SEATS_LEFT_PLACEHOLDER } from '@/data/testimonials';

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

export type PlacesConfig = { total: number; taken: number; enabled: boolean };

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
  { section: 'seats', keys: ['home.seats.text', 'home.seats.left', 'home.seats.note'] },
  { section: 'nav', keys: ['nav.formations', 'nav.pricing', 'nav.login', 'nav.cta'] },
  { section: 'catalog', keys: ['home.testimonials.title', 'home.testimonials.eyebrow'] },
];

type Store = {
  testimonials: SiteTestimonial[];
  places: PlacesConfig;
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

export function getSite(): Store {
  if (cache) return cache;
  cache = {
    testimonials: seedTestimonials.map((t) => ({
      id: t.id,
      name: t.name,
      location: t.location,
      courseSlug: null,
      quote_ht: t.quote_ht,
      quote_fr: t.quote_fr,
      photo: t.avatar,
      status: 'placeholder' as const,
      createdAt: new Date().toISOString(),
    })),
    places: { total: 40, taken: 40 - SEATS_LEFT_PLACEHOLDER, enabled: true },
    textOverrides: {},
    legal: [seedLegal('cgu'), seedLegal('confidentialite'), seedLegal('remboursement')],
    tokens: [],
  };
  return cache;
}
