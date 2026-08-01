import type { Course, Lesson } from '@/data/courses';

type Loc = string;

export function courseTitle(c: Course, locale: Loc): string {
  return locale === 'ht' ? c.title_ht : c.title_fr;
}
export function courseTagline(c: Course, locale: Loc): string {
  return locale === 'ht' ? c.tagline_ht : c.tagline_fr;
}
export function courseLearn(c: Course, locale: Loc): string[] {
  return locale === 'ht' ? c.learn_ht : c.learn_fr;
}
export function courseAudience(c: Course, locale: Loc): string {
  return locale === 'ht' ? c.audience_ht : c.audience_fr;
}
export function lessonTitle(l: Lesson, locale: Loc): string {
  return locale === 'ht' ? l.title_ht : l.title_fr;
}

/**
 * Optional course translation (Task: course-language). `bilingual` is
 * OPTIONAL on `Course` (the 9 static catalog entries never set it) —
 * `undefined` defaults to `true`, matching the DB column's own
 * `NOT NULL DEFAULT true`. Always read through this instead of
 * `course.bilingual` directly so that default is never re-implemented.
 */
export function courseIsBilingual(c: Pick<Course, 'bilingual'>): boolean {
  return c.bilingual !== false;
}

/** Same reasoning as `courseIsBilingual` — defaults to 'ht', matching the DB column. */
export function coursePrimaryLocale(c: Pick<Course, 'primary_locale'>): 'ht' | 'fr' {
  return c.primary_locale ?? 'ht';
}

export function formatDuration(
  totalMinutes: number,
  hourShort: string,
  minShort: string,
): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return m > 0 ? `${h}${hourShort} ${m} ${minShort}` : `${h}${hourShort}`;
  return `${m} ${minShort}`;
}
