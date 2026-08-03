import { getTranslations } from 'next-intl/server';
import { IconArrowRight, IconStarFilled } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { SmartImage } from '@/components/ui/SmartImage';
import { buttonClasses } from '@/components/ui/Button';
import { siteImageSrc } from '@/lib/courseImage';
import type { PublicTeacher } from '@/lib/teacher/public';

/**
 * The teachers rail (Stage: the living manifest, section 3) — DB-backed
 * cards for every teacher whose /prof/[slug] page actually exists (resolved
 * through the exact same read, see lib/home/source.ts's getHomeTeachers).
 * A rating renders ONLY when real reviews exist; otherwise the card simply
 * doesn't claim one. With a single teacher the section honestly presents
 * « Premye anseyan yo » plus a recruit card — an open roster, not
 * frozen-forever copy.
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
          {teachers.map((teacher, i) => {
            const hasRating = teacher.rating.avg !== null && teacher.rating.count > 0;
            return (
              <Reveal key={teacher.slug} delay={(i % 3) * 70} className="h-full">
                <Link
                  href={`/prof/${teacher.slug}`}
                  className="card-hover group flex h-full flex-col rounded-xl border border-ink/12 bg-paper-light p-5 outline-none transition-colors hover:border-ochre/40 focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/40">
                    {teacher.docNo}
                  </span>
                  <span className="mt-3 flex items-center gap-4">
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-ink/15 bg-ink">
                      {teacher.photoUrl ? (
                        // An external, protocol-validated photo URL (same
                        // reasoning as /prof/[slug]): plain <img>, no remote-
                        // host config needed.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={teacher.photoUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <SmartImage
                          src={siteImageSrc(teacher.imageName)}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-xl font-bold leading-tight text-ink">
                        {teacher.displayName}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-ink/55">
                        {t('courseCount', { count: teacher.courseCount })}
                        {hasRating && (
                          <span className="inline-flex items-center gap-1">
                            <span aria-hidden="true" className="text-ink/25">
                              ·
                            </span>
                            <IconStarFilled size={12} className="text-ochre" aria-hidden="true" />
                            {t('rating', {
                              avg: teacher.rating.avg!.toFixed(1),
                              count: teacher.rating.count,
                            })}
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="mt-4 line-clamp-2 text-sm leading-relaxed text-graphite/75">
                    {teacher.bio}
                  </span>
                  <span className="mt-auto flex items-center gap-1.5 pt-4 font-mono text-[11px] uppercase tracking-wide text-teal transition-colors group-hover:text-ochre">
                    {t('viewProfile')}
                    <IconArrowRight
                      size={13}
                      className="transition-transform duration-150 group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </Reveal>
            );
          })}

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
