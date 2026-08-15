import { courses, type Course } from '@/data/courses';
import { getPublishedCourses } from '@/lib/courses/source';

/**
 * Teacher registry — static counterpart of the future `teacher_profiles`
 * table (marketplace spec §3 / C3). Teacher #1 is the platform itself: the
 * founder account that owns the 9 launch courses. The shape mirrors what
 * the DB will carry so the `/prof/[slug]` page needs no redesign at C3 —
 * fields that only exist with real marketplace data (`rating`,
 * `studentCount`) are `null` today and render as « — ».
 */
export type Teacher = {
  /** Public URL segment: /prof/[slug]. */
  slug: string;
  displayName: string;
  /** Initials stamped on the personal seal (« sceau personnel »). */
  initials: string;
  bio_ht: string;
  bio_fr: string;
  /** Compact 1-2 sentence bio for tight placements (course sales page teacher
   * block) where the full `bio_*` story would be too long. */
  shortBio_ht: string;
  shortBio_fr: string;
  /** Base name resolved via lib/courseImage `siteImageSrc` (photo in /public/images). */
  imageName: string;
  /** Slugs into data/courses.ts — the teacher's published manifest. */
  courseSlugs: string[];
  joinedYear: number;
  /** Weighted average of course reviews — null until C3 reviews exist (display « — »). */
  rating: number | null;
  /** Distinct enrolled students — null until real sales data exists (display « — »). */
  studentCount: number | null;
};

export const teachers: Teacher[] = [
  {
    slug: 'daceus-dadlyn',
    displayName: 'Daceus Dadlyn',
    initials: 'DD',
    bio_ht:
      'Mwen kòmanse ak yon biznis senp: pote pakè ant Miami ak Ayiti. Sou wout la, mwen te wè menm baryè a chak jou — moun ki gen talan, men san kat pou peye sou entènèt, san zouti pou vann, san konfyans nan dijital la. Se konsa fòmasyon sa yo fèt: chak ladan yo soti nan yon pwoblèm mwen te rezoud toutbon, ak pwòp lajan mwen, nan reyalite Ayiti a. Pa gen teyori pou plezi — se etap konkrè, an kreyòl, ou ka aplike menm jou a.',
    bio_fr:
      "J'ai commencé avec un business simple : transporter des colis entre Miami et Haïti. En chemin, je voyais la même barrière chaque jour — des gens talentueux, mais sans carte pour payer en ligne, sans outils pour vendre, sans confiance dans le numérique. C'est ainsi que ces formations sont nées : chacune vient d'un problème que j'ai réellement résolu, avec mon propre argent, dans la réalité haïtienne. Pas de théorie pour le plaisir — des étapes concrètes, à appliquer le jour même.",
    shortBio_ht:
      'Fòmasyon ki soti nan pwoblèm mwen te rezoud toutbon, ak pwòp lajan mwen, nan reyalite Ayiti a.',
    shortBio_fr:
      "Des formations nées de problèmes que j'ai réellement résolus, avec mon propre argent, dans la réalité haïtienne.",
    imageName: 'founder',
    courseSlugs: courses.map((c) => c.slug),
    joinedYear: 2026,
    rating: null,
    studentCount: null,
  },
];

export function getTeacher(slug: string): Teacher | undefined {
  return teachers.find((t) => t.slug === slug);
}

/**
 * The teacher who owns a given course, if any (marketplace: every course
 * belongs to exactly one teacher). Used by the course sales page's teacher
 * block so the link target is always derived from the registry, never
 * hardcoded to `pnice-academy`.
 */
export function getCourseTeacher(courseSlug: string): Teacher | undefined {
  return teachers.find((t) => t.courseSlugs.includes(courseSlug));
}

/**
 * The teacher's courses, resolved against the PUBLISHED catalog (unknown
 * slugs, or slugs that exist but aren't published, are dropped) — Task
 * C2-T3. Async: reads through `lib/courses/source.ts` (DB-backed, gated,
 * falls back to the static catalog — every static course counts as
 * published there), instead of the static `courses` array directly, so a
 * teacher's public course grid reflects real publish state once courses
 * live in the DB. Callers (public server components) must `await` this.
 */
export async function teacherCourses(teacher: Teacher): Promise<Course[]> {
  const published = await getPublishedCourses();
  const bySlug = new Map(published.map((c) => [c.slug, c]));
  return teacher.courseSlugs
    .map((slug) => bySlug.get(slug))
    .filter((c): c is Course => Boolean(c));
}

export function teacherBio(teacher: Teacher, locale: string): string {
  return locale === 'ht' ? teacher.bio_ht : teacher.bio_fr;
}

/** The compact 1-2 sentence bio (see `shortBio_*` above). */
export function teacherShortBio(teacher: Teacher, locale: string): string {
  return locale === 'ht' ? teacher.shortBio_ht : teacher.shortBio_fr;
}

/**
 * Document number printed on the « fich anseyan » header rail,
 * e.g. ANS-2026-001 — teacher #1 of the 2026 registry.
 */
export function teacherDocNo(teacher: Teacher): string {
  const index = teachers.findIndex((t) => t.slug === teacher.slug);
  return `ANS-${teacher.joinedYear}-${String(index + 1).padStart(3, '0')}`;
}
