import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import {
  IconChevronUp,
  IconChevronDown,
  IconSelector,
  IconCircleCheck,
  IconCircleDot,
  IconEye,
  IconPencil,
  IconSchool,
} from '@tabler/icons-react';
import { getCourseSales } from '@/lib/admin/data';
import { getAdminCourses } from '@/lib/courses/write';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import { isApprovedTeacher } from '@/lib/teacher/profile';
import { getOwnerDisplayNames } from '@/lib/teacher/admin';
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

/**
 * `/admin/cours` — the platform admin's course OVERSIGHT list
 * (feat/separate-authoring). Per the owner's own point ("j'ai demandé deux
 * espaces admin différents — un pour gérer l'entreprise et un pour gérer MES
 * formations comme prof"), this page no longer authors courses (no "Nouveau
 * cours", no authoring "Éditer" link) — that's the teacher studio's job now,
 * even for the owner (teacher #1), exactly like any other teacher (the
 * marketplace's "uniforme — aucun cas spécial" principle). This page keeps
 * only what's genuinely oversight: status/sales stats across every teacher,
 * the "À valider" review queue (approve/reject), a read-only preview link,
 * and — for a course the signed-in admin personally owns — a fast path
 * ("Modifier dans mon studio") into their OWN studio editor.
 */
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
  const canReview = await hasCap('teachers.review');

  // Merge every DB course (incl. drafts) with sales stats.
  const [sales, adminCourses, { userId: clerkId }] = await Promise.all([
    getCourseSales(),
    getAdminCourses(),
    auth(),
  ]);
  // Who's asking: resolves the signed-in admin's own `users.id` so a course
  // they personally own (teacher #1 or any admin who's ALSO an approved
  // teacher) gets a fast path into their own studio, never someone else's.
  const signedInUserId = clerkId && dbConfigured() ? await resolveUserId(clerkId) : null;
  const canUseStudio = signedInUserId ? await isApprovedTeacher(signedInUserId) : false;

  const salesBySlug = new Map(sales.map((s) => [s.slug, s]));
  const rows = adminCourses.map((c) => {
    const s = salesBySlug.get(c.slug);
    return {
      code: c.code, slug: c.slug, title_ht: c.title_ht, title_fr: c.title_fr,
      priceCents: c.priceCents, status: c.status, dirty: c.hasUnpublishedChanges,
      lessonsCount: c.lessonsCount,
      rawStatus: c.rawStatus, reviewNote: c.reviewNote, submittedAt: c.submittedAt,
      ownerUserId: c.ownerUserId,
      enrollments: s?.enrollments ?? 0,
      revenueCents: s?.revenueCents ?? 0,
      completions: s?.completions ?? 0,
      completionRatePct: s?.completionRatePct ?? 0,
    };
  });
  // Batch-resolved once for every row (teacher display name, or "—" — see
  // lib/teacher/admin.ts's getOwnerDisplayNames) so it's obvious whose
  // course each row is, across every teacher on the platform.
  const ownerNames = await getOwnerDisplayNames(rows.map((r) => r.ownerUserId));
  const ownerLabel = (ownerUserId: string | null) => (ownerUserId && ownerNames.get(ownerUserId)) || '—';

  const params = paramsOf(searchParams);
  const pendingRows = rows
    .filter((r) => r.rawStatus === 'pending_review')
    .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));

  /**
   * Land on the work, not on the inventory. Arriving with no ?tab and
   * something waiting used to show the full catalogue — a screen with no
   * approve/reject anywhere — so a course could sit pending for days while the
   * reviewer looked straight at a page that gave no sign of it. An explicit
   * ?tab=all still wins, so "show me everything" remains one click away.
   */
  const explicitTab = params.get('tab');
  const tab =
    canReview && (explicitTab === 'review' || (explicitTab === null && pendingRows.length > 0))
      ? 'review'
      : 'all';
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

  function ViewAction({ slug }: { slug: string }) {
    return (
      <Link href={`${BASE}/${slug}/apercu`} className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/60 hover:text-ink">
        <IconEye size={12} /> {tc('view')}
      </Link>
    );
  }

  function EditInStudioAction({ slug }: { slug: string }) {
    return (
      <Link href={`/enseigner/studio/cours/${slug}/editer`} className="inline-flex items-center gap-1 font-mono text-[11px] text-ochre hover:underline">
        <IconPencil size={12} /> {t('editInStudio')}
      </Link>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-graphite/70">{t('subtitle')}</p>
        {canUseStudio && (
          <Link href="/enseigner/studio" className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-mono text-[11px] font-medium text-paper-light hover:bg-ink/90">
            <IconSchool size={14} /> {t('myStudio')}
          </Link>
        )}
      </div>

      {canReview && (
        <div className="flex flex-wrap gap-2 border-b border-ink/10 pb-2">
          {/* `tab: 'all'` explicitly, not null — with the auto-landing above,
              clearing the param would just bounce back to the review tab. */}
          <Link
            href={`${BASE}${mergeParams(params, { tab: 'all' })}`}
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
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors',
              tab === 'review' ? 'bg-ink text-paper-light' : 'text-ink/55 hover:bg-ink/[0.05]',
            )}
          >
            {tr('tabPending')}
            {/* An ochre count reads as "act on me" where "(1)" read as a
                footnote — this is the one number on the page that means work
                is waiting on a human. */}
            {pendingRows.length > 0 && (
              <span
                className={cn(
                  'rounded px-1.5 py-px text-[10px] font-bold tabular-nums',
                  tab === 'review' ? 'bg-paper-light/25 text-paper-light' : 'bg-ochre text-ink',
                )}
              >
                {pendingRows.length}
              </span>
            )}
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
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-paper-light">
                <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
                  <th className="px-3 py-2">{t('col.course')}</th>
                  <th className="px-3 py-2">{t('col.owner')}</th>
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
                    <td className="px-3 py-2.5 text-[12px] text-ink/70">{ownerLabel(c.ownerUserId)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[13px] text-ink/75 tabular-nums">{fmtUsdCents(c.priceCents)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-ink/60">{fmtDate(c.submittedAt, locale)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        <ViewAction slug={c.slug} />
                        <CourseReviewActions slug={c.slug} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/12">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-paper-light">
              <tr className="border-b border-ink/12 text-left">
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.course')}</th>
                <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.owner')}</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.price')}</th>
                <SortHeader col="enrollments" label={t('col.enrollments')} />
                <SortHeader col="revenue" label={t('col.revenue')} />
                <SortHeader col="completion" label={t('col.completionRate')} />
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.lessons')}</th>
                <th className="px-3 py-2 text-center font-mono text-[10px] uppercase tracking-wide text-ink/55">{t('col.status')}</th>
                <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wide text-ink/55">{tc('actions')}</th>
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
                  <td className="px-3 py-2.5 text-[12px] text-ink/70">{ownerLabel(c.ownerUserId)}</td>
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
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      <ViewAction slug={c.slug} />
                      {canUseStudio && signedInUserId && c.ownerUserId === signedInUserId && (
                        <EditInStudioAction slug={c.slug} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
