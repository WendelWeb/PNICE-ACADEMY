import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/Section';
import { getHomeStats } from '@/lib/home/source';

/**
 * The manifest bar (Stage: the living manifest, section 2) — the registry's
 * live tally in the document voice: an ink band, IBM Plex Mono, real
 * numbers only. Courses/teachers always render (their static fallbacks are
 * true statements about the seeded site); students and certificates appear
 * ONLY when a live DB can actually vouch for a positive number — a `null`
 * or zero claim is simply not printed, never faked.
 */
export async function ManifestBar() {
  const t = await getTranslations('home.stats');
  const stats = await getHomeStats();

  const items = [
    t('courses', { count: stats.courseCount }),
    t('teachers', { count: stats.teacherCount }),
    ...(stats.studentCount !== null && stats.studentCount > 0
      ? [t('students', { count: stats.studentCount })]
      : []),
    ...(stats.certificateCount !== null && stats.certificateCount > 0
      ? [t('certificates', { count: stats.certificateCount })]
      : []),
  ];

  return (
    <div className="bg-ink text-paper-light">
      <Container className="flex flex-col items-center gap-x-8 gap-y-1 py-4 sm:flex-row sm:justify-center md:py-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper-light/45">
          {t('label')}
        </span>
        <ul className="flex flex-wrap items-center justify-center gap-x-2">
          {items.map((item, i) => (
            <li
              key={item}
              className="flex items-center gap-2 font-mono text-xs tracking-[0.06em] text-paper-light/85"
            >
              {i > 0 && (
                <span aria-hidden="true" className="text-paper-light/30">
                  ·
                </span>
              )}
              {item}
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
