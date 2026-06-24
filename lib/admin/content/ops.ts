/**
 * CMS content operations — reads + mutations on the in-memory content store.
 * Server-side; called by the content server actions (lib/admin/content-actions).
 */
import {
  getStore,
  findCourse,
  nextCode,
  nextId,
  slugify,
  type ContentCourse,
  type ContentLesson,
  type ContentFaq,
} from './store';

export function listCourses(): ContentCourse[] {
  return [...getStore()].sort((a, b) => a.order - b.order);
}

export function getCourse(slug: string): ContentCourse | null {
  return findCourse(slug) ?? null;
}

function markDirty(c: ContentCourse) {
  if (c.status === 'published') c.hasUnpublishedChanges = true;
}

export type NewCourseInput = {
  code?: string;
  slug?: string;
  title_ht: string;
  title_fr: string;
  icon?: string;
  priceCents?: number;
};

export function createCourse(input: NewCourseInput): { slug: string } {
  const store = getStore();
  const code = input.code?.trim() || nextCode();
  let slug = (input.slug?.trim() || slugify(input.title_fr || input.title_ht)) || nextId('course');
  // ensure unique slug
  if (store.some((c) => c.slug === slug)) slug = `${slug}-${store.length + 1}`;
  const course: ContentCourse = {
    code,
    slug,
    icon: input.icon || 'book',
    title_ht: input.title_ht,
    title_fr: input.title_fr,
    tagline_ht: '',
    tagline_fr: '',
    desc_ht: '',
    desc_fr: '',
    learn_ht: [],
    learn_fr: [],
    audience_ht: '',
    audience_fr: '',
    priceCents: input.priceCents ?? 0,
    order: store.length + 1,
    status: 'draft',
    hasUnpublishedChanges: false,
    promise_ht: '',
    promise_fr: '',
    problem_ht: '',
    problem_fr: '',
    deliverables_ht: [],
    deliverables_fr: [],
    requirements_ht: [],
    requirements_fr: [],
    faq: [],
    lessons: [],
    mainImage: null,
    secondaryImages: [],
  };
  store.push(course);
  return { slug };
}

/** Editable fields (code/slug/status managed separately). */
export type CoursePatch = Partial<
  Omit<ContentCourse, 'code' | 'slug' | 'status' | 'hasUnpublishedChanges' | 'lessons' | 'secondaryImages' | 'faq'>
> & { faq?: ContentFaq[] };

export function updateCourse(slug: string, patch: CoursePatch): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  Object.assign(c, patch);
  markDirty(c);
  return true;
}

export function publishCourse(slug: string): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  c.status = 'published';
  c.hasUnpublishedChanges = false;
  return true;
}

export function unpublishCourse(slug: string): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  c.status = 'draft';
  c.hasUnpublishedChanges = false;
  return true;
}

export function deleteCourse(slug: string): boolean {
  const store = getStore();
  const i = store.findIndex((c) => c.slug === slug);
  if (i < 0) return false;
  store.splice(i, 1);
  return true;
}

/* ------------------------------- lessons --------------------------------- */
export function addLesson(slug: string): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  c.lessons.push({
    id: nextId('lesson'),
    title_ht: '',
    title_fr: '',
    bunnyVideoId: '',
    durationSeconds: 0,
    isPreview: false,
    sortOrder: c.lessons.length + 1,
  });
  markDirty(c);
  return true;
}

export function updateLesson(slug: string, lessonId: string, patch: Partial<ContentLesson>): boolean {
  const c = findCourse(slug);
  const l = c?.lessons.find((x) => x.id === lessonId);
  if (!c || !l) return false;
  Object.assign(l, patch);
  markDirty(c);
  return true;
}

export function deleteLesson(slug: string, lessonId: string): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  c.lessons = c.lessons.filter((l) => l.id !== lessonId);
  c.lessons.forEach((l, i) => (l.sortOrder = i + 1));
  markDirty(c);
  return true;
}

export function moveLesson(slug: string, lessonId: string, dir: 'up' | 'down'): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  const i = c.lessons.findIndex((l) => l.id === lessonId);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= c.lessons.length) return false;
  [c.lessons[i], c.lessons[j]] = [c.lessons[j], c.lessons[i]];
  c.lessons.forEach((l, k) => (l.sortOrder = k + 1));
  markDirty(c);
  return true;
}

/* -------------------------------- images --------------------------------- */
export function setMainImage(slug: string, url: string | null): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  c.mainImage = url;
  markDirty(c);
  return true;
}

export function addSecondaryImage(slug: string, url: string, alt: string): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  c.secondaryImages.push({ id: nextId('img'), url, alt });
  markDirty(c);
  return true;
}

export function removeSecondaryImage(slug: string, imageId: string): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  c.secondaryImages = c.secondaryImages.filter((x) => x.id !== imageId);
  markDirty(c);
  return true;
}

export function moveSecondaryImage(slug: string, imageId: string, dir: 'up' | 'down'): boolean {
  const c = findCourse(slug);
  if (!c) return false;
  const i = c.secondaryImages.findIndex((x) => x.id === imageId);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= c.secondaryImages.length) return false;
  [c.secondaryImages[i], c.secondaryImages[j]] = [c.secondaryImages[j], c.secondaryImages[i]];
  markDirty(c);
  return true;
}
