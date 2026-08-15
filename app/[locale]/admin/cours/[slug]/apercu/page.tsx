import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowLeft, IconCheck, IconEye, IconFileText, IconNotes, IconLink } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { getAdminCourse, type AdminLesson } from '@/lib/courses/write';
import { getFxRate } from '@/lib/fx';
import { fmtUsdCents, fmtHtgFromCents } from '@/lib/admin/format';
import { bunnyConfigured, bunnyEmbedUrl } from '@/lib/bunny/embed';
import { LessonPreviewButton } from '@/components/courses/LessonPreview';
import { Link } from '@/i18n/routing';
import { Forbidden } from '@/components/admin/Forbidden';

export const dynamic = 'force-dynamic';

export default async function CoursePreviewPage({
  params: { locale, slug },
}: {
  params: { locale: 'ht' | 'fr'; slug: string };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.read'))) return <Forbidden />;
  const t = await getTranslations('admin.cms.preview');
  // Category shown with the catalogue's own labels — the reviewer must see
  // the exact shelf buyers will see.
  const tCat = await getTranslations('catalog');

  const c = await getAdminCourse(slug);
  if (!c) notFound();
  // Task fix/fx-rate-unify: HTG shown at the live admin-set rate.
  const rate = await getFxRate();
  const L = (ht: string, fr: string) => (locale === 'ht' ? ht : fr);
  const learn = locale === 'ht' ? c.learn_ht : c.learn_fr;
  const deliverables = locale === 'ht' ? c.deliverables_ht : c.deliverables_fr;
  const requirements = locale === 'ht' ? c.requirements_ht : c.requirements_fr;

  // Real content preview (Stage 7 — a reviewer used to see lesson TITLES
  // only, approving videos sight-unseen): group the flat `lessons` list by
  // `chapterId` under each chapter (ordered by `sortOrder`), with every
  // ungrouped lesson trailing in its own bucket — same shape
  // lib/courses/source.ts's `mapDbCourseToDetail` groups the public
  // CourseDetail into (chapters + ungroupedLessons), rebuilt here from
  // `AdminCourse`'s flat shape since the CMS/studio editors need every
  // status, not just published.
  const chaptersSorted = [...c.chapters].sort((a, b) => a.sortOrder - b.sortOrder);
  const lessonsSorted = [...c.lessons].sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped = lessonsSorted.filter((l) => !l.chapterId);
  const groups: { key: string; title: string | null; lessons: AdminLesson[] }[] = [
    ...chaptersSorted.map((ch) => ({
      key: ch.id,
      title: L(ch.title_ht, ch.title_fr),
      lessons: lessonsSorted.filter((l) => l.chapterId === ch.id),
    })),
    ...(ungrouped.length > 0 ? [{ key: 'ungrouped', title: chaptersSorted.length > 0 ? t('chapterless') : null, lessons: ungrouped }] : []),
  ].filter((g) => g.lessons.length > 0);

  return (
    <div className="mx-auto max-w-[820px] space-y-4">
      <div className="flex items-center justify-between">
        {/* Back to the course's ADMIN detail, not to an editor: this preview
            is a moderation tool. The old target (/admin/cours/[slug]/editer)
            has been a redirect since authoring moved to the studio. */}
        <Link href={`/admin/cours/${slug}`} className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
          <IconArrowLeft size={14} /> {t('back')}
        </Link>
        <span className="inline-flex items-center gap-1 rounded bg-ochre/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ochre">
          <IconEye size={12} /> {t('badge')}
        </span>
      </div>

      <article className="rounded-2xl border border-ink/12 bg-paper-light p-6 sm:p-8">
        <span className="font-mono text-[10px] uppercase tracking-wide text-ink/40">{c.code}</span>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">{L(c.title_ht, c.title_fr)}</h1>
        <p className="mt-2 text-lg text-graphite/80">{L(c.tagline_ht, c.tagline_fr)}</p>

        {/* Tags + catégorie (août 2026) — part of what the reviewer approves:
            a course filed on the wrong shelf or stuffed with misleading tags
            is a moderation call, so both are visible here. */}
        {(c.category !== null || c.tags.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {c.category !== null && (
              <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-ink/65">
                {tCat(`categories.${c.category}`)}
              </span>
            )}
            {c.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-ink/15 px-2 py-0.5 font-mono text-[10px] text-ink/55"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold text-ochre">{fmtUsdCents(c.priceCents)}</span>
          <span className="font-mono text-xs text-ink/50">{fmtHtgFromCents(c.priceCents, rate)}</span>
        </div>

        {L(c.promise_ht, c.promise_fr) && (
          <p className="mt-6 rounded-lg bg-teal/[0.06] p-4 text-[15px] leading-relaxed text-ink">{L(c.promise_ht, c.promise_fr)}</p>
        )}
        {L(c.problem_ht, c.problem_fr) && (
          <p className="mt-4 text-[15px] leading-relaxed text-graphite/85">{L(c.problem_ht, c.problem_fr)}</p>
        )}

        {learn.filter(Boolean).length > 0 && (
          <Block title={t('learn')}>
            <ul className="space-y-1.5">
              {learn.filter(Boolean).map((x, i) => (
                <li key={i} className="flex items-start gap-2 text-[15px] text-ink/85"><IconCheck size={16} className="mt-0.5 shrink-0 text-teal" />{x}</li>
              ))}
            </ul>
          </Block>
        )}

        {deliverables.filter(Boolean).length > 0 && (
          <Block title={t('deliverables')}>
            <ul className="list-disc space-y-1 pl-5 text-[15px] text-ink/85">
              {deliverables.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </Block>
        )}

        {groups.length > 0 && (
          <Block title={t('lessons')}>
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.key}>
                  {g.title && <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ink/45">{g.title}</p>}
                  <ol className="space-y-2">
                    {g.lessons.map((l, i) => {
                      const embedUrl = bunnyConfigured() ? bunnyEmbedUrl(l.bunnyVideoId) : null;
                      const desc = L(l.desc_ht, l.desc_fr);
                      const notes = L(l.notes_ht, l.notes_fr);
                      return (
                        <li key={l.id} className="rounded-lg border border-ink/10 bg-paper px-3 py-2.5 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0">
                              <span className="font-mono text-[11px] text-ink/40">{i + 1}.</span> {L(l.title_ht, l.title_fr)}
                            </span>
                            {l.isPreview && <span className="shrink-0 rounded bg-teal/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-teal">{t('previewLesson')}</span>}
                          </div>

                          <div className="mt-1.5">
                            {embedUrl ? (
                              <LessonPreviewButton
                                title={L(l.title_ht, l.title_fr)}
                                embedUrl={embedUrl}
                                openLabel={t('watchVideo')}
                                closeLabel={t('closeVideo')}
                              />
                            ) : (
                              <span className="font-mono text-[10px] uppercase tracking-wide text-ink/35">{t('noVideo')}</span>
                            )}
                          </div>

                          {desc && <p className="mt-2 text-[13px] leading-relaxed text-graphite/80">{desc}</p>}

                          {notes && (
                            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-ink/[0.03] p-2 text-xs leading-relaxed text-graphite/75">
                              <IconNotes size={13} className="mt-0.5 shrink-0 text-ink/35" />
                              <span>
                                <span className="block font-mono text-[9px] uppercase tracking-wide text-ink/40">{t('notesLabel')}</span>
                                {notes}
                              </span>
                            </p>
                          )}

                          {l.resources.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {l.resources.map((r, ri) => (
                                <li key={ri}>
                                  <a
                                    href={r.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 font-mono text-[11px] text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal"
                                  >
                                    {r.kind === 'file' ? <IconFileText size={12} /> : <IconLink size={12} />}
                                    {L(r.label_ht, r.label_fr) || r.url}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </Block>
        )}

        {c.resources.length > 0 && (
          <Block title={t('courseResourcesLabel')}>
            <ul className="space-y-1.5">
              {c.resources.map((r, ri) => (
                <li key={ri}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-[12px] text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal"
                  >
                    {r.kind === 'file' ? <IconFileText size={13} /> : <IconLink size={13} />}
                    {L(r.label_ht, r.label_fr) || r.url}
                  </a>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {requirements.filter(Boolean).length > 0 && (
          <Block title={t('requirements')}>
            <ul className="list-disc space-y-1 pl-5 text-[15px] text-ink/85">
              {requirements.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </Block>
        )}

        {c.faq.length > 0 && (
          <Block title="FAQ">
            <ul className="space-y-3">
              {c.faq.map((f) => (
                <li key={f.id}>
                  <p className="text-sm font-semibold text-ink">{L(f.q_ht, f.q_fr)}</p>
                  <p className="mt-0.5 text-sm text-graphite/80">{L(f.a_ht, f.a_fr)}</p>
                </li>
              ))}
            </ul>
          </Block>
        )}
      </article>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-ink/10 pt-5">
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-ink/55">{title}</h2>
      {children}
    </section>
  );
}
