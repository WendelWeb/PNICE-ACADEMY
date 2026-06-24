import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowLeft, IconUsers, IconCoin, IconCertificate, IconTrendingDown, IconPencil } from '@tabler/icons-react';
import { getCourseDetail } from '@/lib/admin/data';
import { fmtUsdCents, fmtInt, fmtPct } from '@/lib/admin/format';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export default async function CourseDetailPage({
  params: { locale, slug },
}: {
  params: { locale: 'ht' | 'fr'; slug: string };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.read'))) return <Forbidden />;

  const t = await getTranslations('admin.courses');
  const tc = await getTranslations('admin.cms.list');
  const canEdit = await hasCap('courses.edit');
  const detail = await getCourseDetail(slug);
  if (!detail) notFound();

  const { course, enrolled, lessons, worstLessonIndex } = detail;
  const pct = (n: number) => (enrolled ? (n / enrolled) * 100 : 0);

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <Link href="/admin/cours" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
        <IconArrowLeft size={14} /> {t('detail.back')}
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="font-mono text-[10px] uppercase text-ink/40">{course.code}</span>
            <h1 className="font-display text-xl font-bold text-ink">{locale === 'ht' ? course.title_ht : course.title_fr}</h1>
          </div>
          {canEdit && (
            <Link href={`/admin/cours/${slug}/editer`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-ochre/40 px-2.5 py-1.5 font-mono text-[11px] font-medium text-ochre hover:bg-ochre/10">
              <IconPencil size={13} /> {tc('edit')}
            </Link>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<IconUsers size={14} />} label={t('detail.enrolled')} value={fmtInt(enrolled)} />
          <Stat icon={<IconCoin size={14} />} label={t('col.revenue')} value={fmtUsdCents(course.revenueCents)} />
          <Stat icon={<IconCertificate size={14} />} label={t('col.completions')} value={fmtInt(course.completions)} />
          <Stat icon={<IconTrendingDown size={14} />} label={t('col.completionRate')} value={fmtPct(course.completionRatePct)} tone="teal" />
        </div>
      </div>

      {/* Per-lesson drop-off */}
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('detail.funnel')}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[10px] text-ink/55">
          <Legend cls="bg-teal" label={t('detail.completed')} />
          <Legend cls="bg-ochre" label={t('detail.started')} />
          <Legend cls="bg-ink/15" label={t('detail.neverOpened')} />
        </div>

        <ol className="mt-3 space-y-2">
          {lessons.map((l) => {
            const worst = l.index === worstLessonIndex;
            const startedNotDone = l.opened - l.completed;
            return (
              <li
                key={l.index}
                className={cn('rounded-lg border bg-paper p-3', worst ? 'border-stampred/40' : 'border-ink/10')}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">
                      <span className="font-mono text-[11px] text-ink/40">#{l.index + 1}</span>{' '}
                      {locale === 'ht' ? l.title_ht : l.title_fr}
                    </span>
                    <span className="font-mono text-[10px] text-ink/50">
                      {t('detail.avgWatch')}: {l.avgWatchMinutes} min
                    </span>
                  </span>
                  {worst && (
                    <span className="shrink-0 rounded bg-stampred/12 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-stampred">
                      {t('detail.biggestDrop')}
                    </span>
                  )}
                </div>

                {/* Stacked funnel bar */}
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-ink/8">
                  <div className="h-full bg-teal" style={{ width: `${pct(l.completed)}%` }} />
                  <div className="h-full bg-ochre" style={{ width: `${pct(startedNotDone)}%` }} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] text-ink/55 tabular-nums">
                  <span><span className="text-teal">●</span> {t('detail.completed')}: {fmtInt(l.completed)}</span>
                  <span><span className="text-ochre">●</span> {t('detail.started')}: {fmtInt(startedNotDone)}</span>
                  <span><span className="text-ink/40">●</span> {t('detail.neverOpened')}: {fmtInt(l.neverOpened)}</span>
                  <span className={cn('ml-auto', l.dropPct >= 40 ? 'text-stampred' : 'text-ink/55')}>
                    {t('detail.drop')}: {fmtPct(l.dropPct)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'teal' }) {
  return (
    <div className="rounded-lg bg-paper p-2.5">
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink/45">
        {icon} {label}
      </span>
      <span className={cn('mt-1 block font-mono text-base font-semibold tabular-nums', tone === 'teal' ? 'text-teal' : 'text-ink')}>
        {value}
      </span>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', cls)} />
      {label}
    </span>
  );
}
