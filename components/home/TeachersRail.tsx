import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { buttonClasses } from '@/components/ui/Button';
import { TeacherCard } from '@/components/teacher/TeacherCard';
import type { PublicTeacher } from '@/lib/teacher/public';

/**
 * The teachers rail (Stage: the living manifest, section 3) — DB-backed
 * cards for every teacher whose /prof/[slug] page actually exists (resolved
 * through the exact same read, see lib/home/source.ts's getHomeTeachers).
 * A rating renders ONLY when real reviews exist; otherwise the card simply
 * doesn't claim one. With a single teacher the section honestly presents
 * « Premye anseyan yo » plus a recruit card — an open roster, not
 * frozen-forever copy. The card itself is the shared
 * components/teacher/TeacherCard.tsx (Stage 4), the same one the `/prof`
 * teacher directory renders — one design, two placements.
 */
export async function TeachersRail({ teachers }: { teachers: PublicTeacher[] }) {
  const t = await getTranslations('home.teachersRail');
  if (teachers.length === 0) return null;

  return (
    <Section id="anseyan">
      <Container>
        <Reveal>
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
            {t('title', { count: teachers.length })}
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {teachers.map((teacher, i) => (
            <Reveal key={teacher.slug} delay={(i % 3) * 70} className="h-full">
              <TeacherCard teacher={teacher} />
            </Reveal>
          ))}

          {/* the open seat — the roster is recruiting, honestly */}
          <Reveal delay={(teachers.length % 3) * 70} className="h-full">
            <div className="flex h-full flex-col items-start justify-between rounded-xl border border-dashed border-teal/40 bg-teal/[0.04] p-5">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">
                  {t('recruitKicker')}
                </span>
                <h3 className="mt-3 font-display text-xl font-bold leading-tight text-ink">
                  {t('recruitTitle')}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite/80">
                  {t('recruitBody')}
                </p>
              </div>
              <Link href="/enseigner" className={buttonClasses('ghost', 'md', 'mt-5')}>
                {t('recruitCta')}
              </Link>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
