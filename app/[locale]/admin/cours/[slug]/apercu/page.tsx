import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowLeft, IconCheck, IconEye } from '@tabler/icons-react';
import { hasCap } from '@/lib/admin/guard';
import { getCourse } from '@/lib/admin/content/ops';
import { fmtUsdCents, fmtHtgFromCents } from '@/lib/admin/format';
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

  const c = getCourse(slug);
  if (!c) notFound();
  const L = (ht: string, fr: string) => (locale === 'ht' ? ht : fr);
  const learn = locale === 'ht' ? c.learn_ht : c.learn_fr;
  const deliverables = locale === 'ht' ? c.deliverables_ht : c.deliverables_fr;
  const requirements = locale === 'ht' ? c.requirements_ht : c.requirements_fr;

  return (
    <div className="mx-auto max-w-[820px] space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/admin/cours/${slug}/editer`} className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
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

        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold text-ochre">{fmtUsdCents(c.priceCents)}</span>
          <span className="font-mono text-xs text-ink/50">{fmtHtgFromCents(c.priceCents)}</span>
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

        {c.lessons.length > 0 && (
          <Block title={t('lessons')}>
            <ol className="space-y-1.5">
              {c.lessons.map((l, i) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm">
                  <span><span className="font-mono text-[11px] text-ink/40">{i + 1}.</span> {L(l.title_ht, l.title_fr)}</span>
                  {l.isPreview && <span className="rounded bg-teal/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-teal">{t('previewLesson')}</span>}
                </li>
              ))}
            </ol>
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
