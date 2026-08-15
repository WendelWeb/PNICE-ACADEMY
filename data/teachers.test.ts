import { describe, it, expect } from 'vitest';
import {
  teachers,
  getTeacher,
  getCourseTeacher,
  teacherCourses,
  teacherDocNo,
  teacherShortBio,
} from './teachers';
import { getCourse, courses } from './courses';

describe('teachers data', () => {
  it('has teacher #1: the platform account owning all 9 launch courses', () => {
    const t = getTeacher('daceus-dadlyn');
    expect(t).toBeDefined();
    expect(t!.displayName).toBe('Daceus Dadlyn');
    expect(t!.courseSlugs).toHaveLength(9);
    expect(t!.joinedYear).toBe(2026);
  });

  it('has unique slugs', () => {
    const slugs = new Set(teachers.map((t) => t.slug));
    expect(slugs.size).toBe(teachers.length);
  });

  it('only references course slugs that exist in the catalog', async () => {
    for (const t of teachers) {
      for (const slug of t.courseSlugs) {
        expect(getCourse(slug), `unknown course slug: ${slug}`).toBeDefined();
      }
      expect(await teacherCourses(t)).toHaveLength(t.courseSlugs.length);
    }
  });

  it('has bilingual bios and seal initials for every teacher', () => {
    for (const t of teachers) {
      expect(t.bio_ht.length).toBeGreaterThan(0);
      expect(t.bio_fr.length).toBeGreaterThan(0);
      expect(t.initials.length).toBeGreaterThan(0);
      expect(t.initials.length).toBeLessThanOrEqual(3);
    }
  });

  it('has a bilingual short bio (course-page teacher block) for every teacher', () => {
    for (const t of teachers) {
      expect(t.shortBio_ht.length).toBeGreaterThan(0);
      expect(t.shortBio_fr.length).toBeGreaterThan(0);
      expect(teacherShortBio(t, 'ht')).toBe(t.shortBio_ht);
      expect(teacherShortBio(t, 'fr')).toBe(t.shortBio_fr);
    }
  });

  it('resolves the owning teacher for every catalog course', () => {
    for (const c of courses) {
      expect(getCourseTeacher(c.slug), `no teacher for course: ${c.slug}`).toBeDefined();
    }
    expect(getCourseTeacher('nope')).toBeUndefined();
  });

  it('keeps marketplace-only fields null until real data exists', () => {
    const t = getTeacher('daceus-dadlyn')!;
    expect(t.rating).toBeNull();
    expect(t.studentCount).toBeNull();
  });

  it('resolves by slug and returns undefined for unknown slugs', () => {
    expect(getTeacher('daceus-dadlyn')?.initials).toBe('DD');
    expect(getTeacher('nope')).toBeUndefined();
  });

  it('derives a registry document number', () => {
    expect(teacherDocNo(getTeacher('daceus-dadlyn')!)).toBe('ANS-2026-001');
  });
});
