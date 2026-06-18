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
