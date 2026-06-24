import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconArrowUp, IconArrowDown, IconUserPause, IconChartArcs } from '@tabler/icons-react';
import { courses } from '@/data/courses';
import {
  getCourseCompletion,
  getCourseTimes,
  getLessonViews,
  getAggregateDropoff,
  getActiveLearners,
  getStuckUsers,
} from '@/lib/admin/data';
import { fmtInt, fmtPct, fmtUsdCents, fmtDate } from '@/lib/admin/format';
import { hasCap } from '@/lib/admin/guard';
import { type RawSearchParams } from '@/lib/admin/users-query';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { Forbidden } from '@/components/admin/Forbidden';
import { LazyDropoff } from '@/components/admin/engagement/LazyDropoff';
import { ActiveLearnersFilter } from '@/components/admin/engagement/ActiveLearnersFilter';
import { StuckReminderButton } from '@/components/admin/engagement/StuckReminderButton';

export const dynamic = 'force-dynamic';

function Panel({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-ink/12 bg-paper-light p-4', className)}>
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function EngagementPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.read'))) return <Forbidden />;

  const t = await getTranslations('admin.engagement');
  const days = (Array.isArray(searchParams.days) ? searchParams.days[0] : searchParams.days) === '30' ? 30 : 7;
  const course = Array.isArray(searchParams.course) ? searchParams.course[0] : searchParams.course;
  const title = (x: { title_fr: string; title_ht: string }) => (locale === 'ht' ? x.title_ht : x.title_fr);
  const lessonTitle = (x: { lessonTitle_fr: string; lessonTitle_ht: string }) =>
    locale === 'ht' ? x.lessonTitle_ht : x.lessonTitle_fr;

  const [completion, times, lessons, dropoff, active, stuck] = await Promise.all([
    getCourseCompletion(),
    getCourseTimes(),
    getLessonViews(),
    getAggregateDropoff(),
    getActiveLearners({ days, course }),
    getStuckUsers(),
  ]);
  const completionSorted = [...completion].sort((a, b) => a.completionRatePct - b.completionRatePct);
  const catalog = courses.map((c) => ({ slug: c.slug, title: title(c) }));

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      {/* 1. Completion by course */}
      <Panel title={t('completion.title')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
                <th className="py-1.5 pr-2">{t('completion.course')}</th>
                <th className="py-1.5 pr-2 text-right">{t('completion.enrolled')}</th>
                <th className="py-1.5 pr-2 text-right">{t('completion.started')}</th>
                <th className="py-1.5 pr-2 text-right">{t('completion.completed')}</th>
                <th className="py-1.5 w-44">{t('completion.rate')}</th>
              </tr>
            </thead>
            <tbody>
              {completionSorted.map((c) => (
                <tr key={c.slug} className="border-b border-ink/8 last:border-0">
                  <td className="py-2 pr-2">
                    <Link href={`/admin/cours/${c.slug}`} className="text-[13px] text-ink hover:text-ochre">
                      <span className="font-mono text-[10px] text-ink/40">{c.code}</span> {title(c)}
                    </Link>
                  </td>
                  <td className="py-2 pr-2 text-right font-mono text-[13px] text-ink/70 tabular-nums">{fmtInt(c.enrolled)}</td>
                  <td className="py-2 pr-2 text-right font-mono text-[13px] text-ink/70 tabular-nums">{fmtInt(c.startedCount)}</td>
                  <td className="py-2 pr-2 text-right font-mono text-[13px] text-ink tabular-nums">{fmtInt(c.completedCount)}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                        <span className={cn('block h-full rounded-full', c.completionRatePct < 30 ? 'bg-stampred' : c.completionRatePct < 50 ? 'bg-ochre' : 'bg-teal')} style={{ width: `${c.completionRatePct}%` }} />
                      </span>
                      <span className="w-12 text-right font-mono text-[11px] text-ink/70 tabular-nums">{fmtPct(c.completionRatePct)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 2. Time to finish */}
      <Panel title={t('times.title')}>
        <p className="mb-2 text-[11px] leading-snug text-graphite/60">{t('times.note')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
                <th className="py-1.5 pr-2">{t('times.course')}</th>
                <th className="py-1.5 pr-2 text-right">{t('times.completers')}</th>
                <th className="py-1.5 pr-2 text-right">{t('times.median')}</th>
                <th className="py-1.5 text-right">{t('times.mean')}</th>
              </tr>
            </thead>
            <tbody>
              {times.map((c) => (
                <tr key={c.slug} className="border-b border-ink/8 last:border-0">
                  <td className="py-2 pr-2 text-[13px] text-ink/85">
                    <span className="font-mono text-[10px] text-ink/40">{c.code}</span> {title(c)}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono text-[13px] text-ink/70 tabular-nums">{fmtInt(c.completers)}</td>
                  <td className="py-2 pr-2 text-right font-mono text-[13px] font-medium text-teal tabular-nums">{c.medianDays} {t('times.days')}</td>
                  <td className="py-2 text-right font-mono text-[13px] text-ink/55 tabular-nums">{c.meanDays} {t('times.days')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 3 + 4. Lesson ranks */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('lessons.top')} icon={<IconArrowUp size={13} className="text-teal" />}>
          <LessonList rows={lessons.top} title={title} lessonTitle={lessonTitle} kind="views" t={t} />
        </Panel>
        <Panel title={t('lessons.bottom')} icon={<IconArrowDown size={13} className="text-stampred" />}>
          <LessonList rows={lessons.bottom} title={title} lessonTitle={lessonTitle} kind="abandon" t={t} />
        </Panel>
      </div>

      {/* 5. Aggregate drop-off */}
      <Panel title={t('dropoff.title')} icon={<IconChartArcs size={13} />}>
        <p className="mb-2 text-[11px] leading-snug text-graphite/60">{t('dropoff.note')}</p>
        <LazyDropoff points={dropoff} />
      </Panel>

      {/* 6. Active learners */}
      <Panel title={t('active.title')}>
        <div className="mb-3">
          <ActiveLearnersFilter courses={catalog} />
        </div>
        {active.length === 0 ? (
          <p className="font-mono text-xs text-graphite/55">{t('active.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-wide text-ink/50">
                  <th className="py-1.5 pr-2">{t('active.user')}</th>
                  <th className="py-1.5 pr-2">{t('active.course')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('active.progress')}</th>
                  <th className="py-1.5 text-right">{t('active.lastSeen')}</th>
                </tr>
              </thead>
              <tbody>
                {active.slice(0, 40).map((a) => (
                  <tr key={a.userId} className="border-b border-ink/8 last:border-0">
                    <td className="py-2 pr-2">
                      <Link href={`/admin/utilisateurs/${a.userId}`} className="text-[13px] text-ink hover:text-ochre">{a.userName}</Link>
                    </td>
                    <td className="py-2 pr-2 text-[12px] text-ink/75">{locale === 'ht' ? a.courseTitle_ht : a.courseTitle_fr}</td>
                    <td className="py-2 pr-2 text-right font-mono text-[12px] text-ink/70 tabular-nums">{a.lessonsDone}/{a.lessonsTotal}</td>
                    <td className="py-2 text-right font-mono text-[11px] text-ink/55 tabular-nums">{fmtDate(a.lastActiveAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 7. Stuck users */}
      <Panel title={t('stuck.title')} icon={<IconUserPause size={13} className="text-ochre" />}>
        <p className="mb-2 text-[11px] leading-snug text-graphite/60">{t('stuck.note')}</p>
        {stuck.length === 0 ? (
          <p className="font-mono text-xs text-graphite/55">{t('stuck.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {stuck.map((s) => (
              <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper px-3 py-2">
                <span className="min-w-0">
                  <Link href={`/admin/utilisateurs/${s.userId}`} className="block truncate text-[13px] font-medium text-ink hover:text-ochre">{s.userName}</Link>
                  <span className="block font-mono text-[10px] text-ink/45">
                    {fmtDate(s.createdAt, locale)} · {s.courses.map((c) => c.code).join(', ') || '—'} · {fmtUsdCents(s.amountPaidCents)}
                  </span>
                </span>
                <StuckReminderButton userId={s.userId} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function LessonList({
  rows,
  title,
  lessonTitle,
  kind,
  t,
}: {
  rows: import('@/lib/admin/data').LessonViewRow[];
  title: (x: { title_fr: string; title_ht: string }) => string;
  lessonTitle: (x: { lessonTitle_fr: string; lessonTitle_ht: string }) => string;
  kind: 'views' | 'abandon';
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <ol className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={`${r.slug}-${r.lessonIndex}`} className="flex items-center justify-between gap-2 text-[13px]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-[10px] text-ink/35">{i + 1}.</span>
            <span className="min-w-0">
              <span className="block truncate text-ink/85">
                L{r.lessonIndex + 1} · {lessonTitle({ lessonTitle_fr: r.lessonTitle_fr, lessonTitle_ht: r.lessonTitle_ht })}
              </span>
              <span className="font-mono text-[10px] text-ink/40">
                {r.code} · {title({ title_fr: r.courseTitle_fr, title_ht: r.courseTitle_ht })}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-right">
            {kind === 'views' ? (
              <span className="font-mono text-[12px] font-medium text-teal tabular-nums">{r.views} {t('lessons.views')}</span>
            ) : (
              <span className="font-mono text-[11px] text-stampred tabular-nums">{Math.round(r.abandonPct)}% {t('lessons.abandon')}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
