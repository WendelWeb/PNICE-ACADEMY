import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { Sceau } from '@/components/ui/Sceau';
import { buttonClasses } from '@/components/ui/Button';
import { TeacherCard } from '@/components/teacher/TeacherCard';
import { getAllPublicTeachers } from '@/lib/teacher/public';

// DB-backed roster (gated + fallback to the static registry) — revalidate
// periodically, same policy as /prof/[slug] and /formations.
export const revalidate = 300;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'prof.index' });
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/**
 * `/prof` — the teacher directory (Stage 4). Before this page existed, a
 * « marketplace » with unbrowsable teachers read as a one-author shop: every
 * approved teacher (DB roster ∪ the static registry — with no DB, teacher #1
 * still shows) gets the same card the home rail uses, linking to their
 * public `/prof/[slug]` sheet. Ends on the recruit seat — the roster is
 * openly recruiting, like everywhere else on the site.
 */
export default async function ProfDirectoryPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations('prof.index');
  // The recruit-seat copy is shared with the home rail on purpose — one
  // vocabulary for « Plas ou a la » wherever the open seat appears.
  const tRail = await getTranslations('home.teachersRail');
  const teachers = await getAllPublicTeachers(locale);

  return (
    <Section>
      <Container>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow>{t('eyebrow')}</Eyebrow>
            <h1 className="mt-3 font-display text-4xl font-black leading-tight text-ink md:text-5xl">
              {t('title')}
            </h1>
            <p className="mt-3 max-w-xl text-graphite">
              {t('subtitle', { count: teachers.length })}
            </p>
          </div>
          <Sceau size="md" print rotate={-6} className="shrink-0">
            <span className="font-display text-3xl font-black leading-none">
              {teachers.length}
            </span>
            <span className="mt-0.5 text-[9px] tracking-[0.18em]">anseyan</span>
          </Sceau>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {teachers.map((teacher, i) => (
            <Reveal key={teacher.slug} delay={(i % 3) * 70} className="h-full">
              <TeacherCard teacher={teacher} />
            </Reveal>
          ))}

          {/* the open seat — same honest recruiting card as the home rail */}
          <Reveal delay={(teachers.length % 3) * 70} className="h-full">
            <div className="flex h-full flex-col items-start justify-between rounded-xl border border-dashed border-teal/40 bg-teal/[0.04] p-5">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">
                  {tRail('recruitKicker')}
                </span>
                <h2 className="mt-3 font-display text-xl font-bold leading-tight text-ink">
                  {tRail('recruitTitle')}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-graphite/80">
                  {tRail('recruitBody')}
                </p>
              </div>
              <Link href="/enseigner" className={buttonClasses('ghost', 'md', 'mt-5')}>
                {tRail('recruitCta')}
              </Link>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
