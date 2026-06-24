/**
 * CMS content store (Phase C). A mutable, in-memory catalog the admin edits,
 * SEEDED from the static catalog (data/courses.ts) + sales content
 * (data/courseDetails.ts). Single price per course (the local/diaspora split
 * stays killed — the seed only carries one price).
 *
 * Decision (owner, 2026-06-23): the PUBLIC site keeps reading the static
 * data/courses.ts (unchanged). This store powers the admin CMS + an admin
 * preview only; real public reflection lands with the DB-backed content layer.
 * Persists for the server-process lifetime — replaced by Drizzle later.
 */
import { courses as seedCourses } from '@/data/courses';
import { courseDetails } from '@/data/courseDetails';

export type ContentStatus = 'draft' | 'published';

export type ContentLesson = {
  id: string;
  title_ht: string;
  title_fr: string;
  bunnyVideoId: string;
  durationSeconds: number;
  isPreview: boolean;
  sortOrder: number;
};

export type ContentFaq = { id: string; q_ht: string; q_fr: string; a_ht: string; a_fr: string };
export type ContentImage = { id: string; url: string; alt: string };

export type ContentCourse = {
  code: string;
  slug: string;
  icon: string;
  title_ht: string;
  title_fr: string;
  tagline_ht: string;
  tagline_fr: string;
  desc_ht: string;
  desc_fr: string;
  learn_ht: string[];
  learn_fr: string[];
  audience_ht: string;
  audience_fr: string;
  priceCents: number;
  order: number;
  status: ContentStatus;
  hasUnpublishedChanges: boolean;
  // sales page
  promise_ht: string;
  promise_fr: string;
  problem_ht: string;
  problem_fr: string;
  deliverables_ht: string[];
  deliverables_fr: string[];
  requirements_ht: string[];
  requirements_fr: string[];
  faq: ContentFaq[];
  // lessons + media
  lessons: ContentLesson[];
  mainImage: string | null;
  secondaryImages: ContentImage[];
};

let cache: ContentCourse[] | null = null;
let seq = 0;
export function nextId(prefix: string): string {
  seq++;
  return `${prefix}_${seq.toString().padStart(4, '0')}`;
}

export function getStore(): ContentCourse[] {
  if (cache) return cache;
  cache = seedCourses.map((c, i): ContentCourse => {
    const d = courseDetails[c.code];
    return {
      code: c.code,
      slug: c.slug,
      icon: c.icon,
      title_ht: c.title_ht,
      title_fr: c.title_fr,
      tagline_ht: c.tagline_ht,
      tagline_fr: c.tagline_fr,
      desc_ht: d?.promise_ht ?? c.tagline_ht,
      desc_fr: d?.promise_fr ?? c.tagline_fr,
      learn_ht: [...c.learn_ht],
      learn_fr: [...c.learn_fr],
      audience_ht: c.audience_ht,
      audience_fr: c.audience_fr,
      priceCents: c.priceUsd * 100,
      order: i + 1,
      status: 'published',
      hasUnpublishedChanges: false,
      promise_ht: d?.promise_ht ?? '',
      promise_fr: d?.promise_fr ?? '',
      problem_ht: d?.problem_ht ?? '',
      problem_fr: d?.problem_fr ?? '',
      deliverables_ht: d ? [...d.deliverables_ht] : [],
      deliverables_fr: d ? [...d.deliverables_fr] : [],
      requirements_ht: d ? [...d.requirements_ht] : [],
      requirements_fr: d ? [...d.requirements_fr] : [],
      faq: (d?.faq ?? []).map((f) => ({ id: nextId('faq'), ...f })),
      lessons: c.lessons.map((l, li) => ({
        id: `${c.code}-L${li + 1}`,
        title_ht: l.title_ht,
        title_fr: l.title_fr,
        bunnyVideoId: '',
        durationSeconds: (d?.lessonDetails[li]?.minutes ?? 8) * 60,
        isPreview: li === 0,
        sortOrder: li + 1,
      })),
      mainImage: null,
      secondaryImages: [],
    };
  });
  return cache;
}

export function findCourse(slug: string): ContentCourse | undefined {
  return getStore().find((c) => c.slug === slug);
}

/** Next PA-XX code, incrementing the highest existing numeric suffix. */
export function nextCode(): string {
  const nums = getStore()
    .map((c) => Number(c.code.replace(/[^0-9]/g, '')))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `PA-${String(max + 1).padStart(2, '0')}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
