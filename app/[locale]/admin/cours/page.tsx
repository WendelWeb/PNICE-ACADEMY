import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  IconChevronUp,
  IconChevronDown,
  IconSelector,
  IconCircleCheck,
  IconCircleDot,
  IconPlus,
  IconPencil,
} from '@tabler/icons-react';
import { getCourseSales } from '@/lib/admin/data';
import { getAdminCourses } from '@/lib/courses/write';
import { fmtUsdCents, fmtInt, fmtPct, fmtDate } from '@/lib/admin/format';
import { paramsOf, mergeParams, type RawSearchParams } from '@/lib/admin/users-query';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { CourseReviewActions } from '@/components/admin/content/CourseReviewActions';

export const dynamic = 'force-dynamic';

type SortKey = 'enrollments' | 'revenue' | 'completion';
const BASE = '/admin/cours';

export default async function CoursesPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.read'))) return <Forbidden />;

  const t = await getTranslations('admin.courses');
  const tc = await getTranslations('admin.cms.list');
  const tr = await getTranslations('admin.cms.review');
  const canEdit = await hasCap('courses.edit');
  const canReview = await hasCap('teachers.review');

  // Merge every DB course (incl. drafts) with sales stats.
  const [sales, adminCourses] = await Promise.all([getCourseSales(), getAdminCourses()]);
  const salesBySlug = new Map(sales.map((s) => [s.slug, s]));
  const rows = adminCourses.map((c) => {
    const s = salesBySlug.get(c.slug);
    return {
      code: c.code, slug: c.slug, title_ht: c.title_ht, title_fr: c.title_fr,
      priceCents: c.priceCents, status: c.status, dirty: c.hasUnpublishedChanges,
      lessonsCount: c.lessonsCount,
      rawStatus: c.rawStatus, reviewNote: c.reviewNote, submittedAt: c.submittedAt,
      enrollments: s?.enrollments ?? 0,
      revenueCents: s?.revenueCents ?? 0,
      completions: s?.completions ?? 0,
      completionRatePct: s?.completionRatePct ?? 0,
    };
  });

  const params = paramsOf(searchParams);
  const tab = canReview && params.get('tab') === 'review' ? 'review' : 'all';
  const pendingRows = rows
    .filter((r) => r.rawStatus === 'pending_review')
    .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  const sort = (params.get('sort') as SortKey) || 'revenue';
  const dir = params.get('dir') === 'asc' ? 'asc' : 'desc';
  const mult = dir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'enrollments') return (a.enrollments - b.enrollments) * mult;
    if (sort === 'completion') return (a.completionRatePct - b.completionRatePct) * mult;
    return (a.revenueCents - b.revenueCents) * mult;
  });

  function SortHeader({ col, label }: { col: SortKey; label: string }) {
    const active = sort === col;
    const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
    const Icon = !active ? IconSelector : dir === 'desc' ? IconChevronDown : IconChevronUp;
    return (
      <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">
        <Link href={`${BASE}${mergeParams(params, { sort: col, dir: nextDir })}`} className={cn('inline-flex flex-row-reverse items-center gap-1 hover:text-ink', active && 'text-ink')}>
          {label}
          <Icon size={13} className={active ? 'text-ochre' : 'text-ink/35'} />
        </Link>
      </th>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        {canEdit && (
          <Link href="/admin/cours/nouveau" className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-mono text-[11px] font-medium text-paper-light hover:bg-ink/90">
            <IconPlus size={14} /> {tc('new')}
          </Link>
        )}
      </div>

      {canReview && (
        <div className="flex flex-wrap gap-2 border-b border-ink/10 pb-2">
          <Link
            href={`${BASE}${mergeParams(params, { tab: null })}`}
            className={cn(
              'rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors',
              tab === 'all' ? 'bg-ink text-paper-light' : 'text-ink/55 hover:bg-ink/[0.05]',
            )}
          >
            {tr('tabAll')}
          </Link>
          <Link
            href={`${BASE}${mergeParams(params, { tab: 'review' })}`}
            className={cn(
              'rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors',
              tab === 'review' ? 'bg-ink text-paper-light' : 'text-ink/55 hover:bg-ink/[0.05]',
            )}
          >
            {tr('tabPending')} ({pendingRows.length})
          </Link>
        </div>
      )}

      {tab === 'review' ? (
        pendingRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-12 text-center font-mono text-sm text-graphite/60">
            {tr('empty')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink/12">
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead className="bg-paper-light">
                <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
                  <th className="px-3 py-2">{t('col.course')}</th>
                  <th className="px-3 py-2 text-right">{t('col.price')}</th>
                  <th className="px-3 py-2">{tr('submittedAt')}</th>
                  <th className="px-3 py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((c) => (
                  <tr key={c.slug} className="border-b border-ink/8 last:border-0">
                    <td className="px-3 py-2.5">
                      <Link href={`${BASE}/${c.slug}`} className="group block min-w-0">
                        <span className="block truncate text-[13px] font-medium text-ink group-hover:text-ochre">{locale === 'ht' ? c.title_ht : c.title_fr || c.title_ht}</span>
                        <span className="font-mono text-[10px] uppercase text-ink/40">{c.code}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[13px] text-ink/75 tabular-nums">{fmtUsdCents(c.priceCents)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-ink/60">{fmtDate(c.submittedAt, locale)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <CourseReviewActions slug={c.slug} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/12">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead className="bg-paper-light">
              <tr className="border-b border-ink/12 text-left">
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.course')}</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.price')}</th>
                <SortHeader col="enrollments" label={t('col.enrollments')} />
                <SortHeader col="revenue" label={t('col.revenue')} />
                <SortHeader col="completion" label={t('col.completionRate')} />
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.lessons')}</th>
                <th className="px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.status')}</th>
                {canEdit && <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">{tc('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.slug} className="border-b border-ink/8 transition-colors last:border-0 hover:bg-ochre/[0.04] motion-reduce:transition-none">
                  <td className="px-3 py-2.5">
                    <Link href={`${BASE}/${c.slug}`} className="group block min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink group-hover:text-ochre">{locale === 'ht' ? c.title_ht : c.title_fr || c.title_ht}</span>
                      <span className="font-mono text-[10px] uppercase text-ink/40">{c.code}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] text-ink/75 tabular-nums">{fmtUsdCents(c.priceCents)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm text-ink tabular-nums">{fmtInt(c.enrollments)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm font-medium text-ink tabular-nums">{fmtUsdCents(c.revenueCents)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums">
                    <span className={c.completionRatePct >= 40 ? 'text-teal' : 'text-ink/70'}>{fmtPct(c.completionRatePct)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] text-ink/70 tabular-nums">{c.lessonsCount}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex flex-col items-center gap-0.5">
                      {c.status === 'published' ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-teal"><IconCircleCheck size={13} /> {t('published')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-ink/45"><IconCircleDot size={13} /> {t('draft')}</span>
                      )}
                      {c.dirty && <span className="rounded bg-ochre/15 px-1 font-mono text-[8px] uppercase text-ochre">{tc('pendingChanges')}</span>}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/admin/cours/${c.slug}/editer`} className="inline-flex items-center gap-1 font-mono text-[11px] text-ochre hover:underline">
                        <IconPencil size={12} /> {tc('edit')}
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
