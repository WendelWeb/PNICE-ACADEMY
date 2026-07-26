import { setRequestLocale, getTranslations } from 'next-intl/server';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { listTeacherProfiles, countTeacherProfilesByStatus } from '@/lib/teacher/admin';
import type { TeacherProfile } from '@/lib/teacher/profile';
import { listReviewsForAdmin } from '@/lib/reviews/reviews';
import { fmtDate } from '@/lib/admin/format';
import { paramsOf, mergeParams, type RawSearchParams } from '@/lib/admin/users-query';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { TeacherActions } from '@/components/admin/teachers/TeacherActions';
import { ReviewActions } from '@/components/admin/reviews/ReviewActions';
import { Stars } from '@/components/reviews/Stars';

export const dynamic = 'force-dynamic';

const BASE = '/admin/enseignants';
const TABS: TeacherProfile['status'][] = ['pending', 'approved', 'suspended', 'rejected'];

export default async function TeachersPage({
  params: { locale },
  searchParams,
}: {
  params: { locale: 'ht' | 'fr' };
  searchParams: RawSearchParams;
}) {
  setRequestLocale(locale);
  if (!(await hasCap('teachers.review'))) return <Forbidden />;

  const t = await getTranslations('admin.teachers');
  const params = paramsOf(searchParams);
  const view = params.get('view') === 'reviews' ? 'reviews' : 'teachers';

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>

      <div className="flex flex-wrap gap-2 border-b border-ink/10 pb-2">
        <Link
          href={`${BASE}${mergeParams(params, { view: null, status: null })}`}
          className={cn(
            'rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors',
            view === 'teachers' ? 'bg-ink text-paper-light' : 'text-ink/55 hover:bg-ink/[0.05]',
          )}
        >
          {t('viewTabs.teachers')}
        </Link>
        <Link
          href={`${BASE}${mergeParams(params, { view: 'reviews', status: null })}`}
          className={cn(
            'rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors',
            view === 'reviews' ? 'bg-ink text-paper-light' : 'text-ink/55 hover:bg-ink/[0.05]',
          )}
        >
          {t('viewTabs.reviews')}
        </Link>
      </div>

      {view === 'reviews' ? (
        <ReviewsQueue locale={locale} />
      ) : (
        <TeachersQueue locale={locale} params={params} />
      )}
    </div>
  );
}

async function TeachersQueue({
  locale,
  params,
}: {
  locale: 'ht' | 'fr';
  params: URLSearchParams;
}) {
  const t = await getTranslations('admin.teachers');
  const activeTab = TABS.includes(params.get('status') as TeacherProfile['status'])
    ? (params.get('status') as TeacherProfile['status'])
    : 'pending';

  const [rows, counts] = await Promise.all([listTeacherProfiles(activeTab), countTeacherProfilesByStatus()]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab}
            href={`${BASE}${mergeParams(params, { status: tab })}`}
            className={cn(
              'rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors',
              activeTab === tab ? 'bg-ink text-paper-light' : 'text-ink/55 hover:bg-ink/[0.05]',
            )}
          >
            {t(`tabs.${tab}`)} ({counts[tab]})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-12 text-center font-mono text-sm text-graphite/60">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/12">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="bg-paper-light">
              <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
                <th className="px-3 py-2">{t('col.teacher')}</th>
                <th className="px-3 py-2">{t('col.bio')}</th>
                <th className="px-3 py-2">{t('col.payout')}</th>
                <th className="px-3 py-2">{t('col.appliedAt')}</th>
                <th className="px-3 py-2 text-right">{t('col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bio = (locale === 'ht' ? r.bioHt : r.bioFr) || r.bioHt || r.bioFr || '';
                const bioSnippet = bio.length > 90 ? `${bio.slice(0, 90)}…` : bio;
                return (
                  <tr key={r.id} className="border-b border-ink/8 last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="block text-[13px] font-medium text-ink">{r.displayName || r.name || r.email}</span>
                      <span className="block font-mono text-[10px] text-ink/45">{r.email}</span>
                    </td>
                    <td className="max-w-[280px] px-3 py-2.5 text-[12px] text-graphite/70">{bioSnippet || t('noBio')}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ink/70">
                      {r.payoutMethod ? r.payoutMethod.toUpperCase() : t('noPayout')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-ink/60">{fmtDate(r.appliedAt, locale)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <TeacherActions userId={r.userId} status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function ReviewsQueue({ locale }: { locale: 'ht' | 'fr' }) {
  const t = await getTranslations('admin.reviews');
  const rows = await listReviewsForAdmin();

  return (
    <div className="space-y-4">
      <p className="text-xs text-graphite/60">{t('subtitle')}</p>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 bg-paper-light/50 px-4 py-12 text-center font-mono text-sm text-graphite/60">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/12">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead className="bg-paper-light">
              <tr className="border-b border-ink/12 text-left font-mono text-[10px] uppercase tracking-wide text-ink/55">
                <th className="px-3 py-2">{t('col.course')}</th>
                <th className="px-3 py-2">{t('col.reviewer')}</th>
                <th className="px-3 py-2">{t('col.stars')}</th>
                <th className="px-3 py-2">{t('col.comment')}</th>
                <th className="px-3 py-2">{t('col.status')}</th>
                <th className="px-3 py-2">{t('col.date')}</th>
                <th className="px-3 py-2 text-right">{t('col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const title = (locale === 'ht' ? r.courseTitleHt : r.courseTitleFr) || r.courseSlug;
                const commentSnippet = r.comment && r.comment.length > 80 ? `${r.comment.slice(0, 80)}…` : r.comment;
                return (
                  <tr key={r.id} className="border-b border-ink/8 last:border-0">
                    <td className="max-w-[180px] px-3 py-2.5 text-[13px] font-medium text-ink">{title}</td>
                    <td className="px-3 py-2.5">
                      <span className="block text-[12px] text-ink/75">{r.reviewerName || '—'}</span>
                      <span className="block font-mono text-[10px] text-ink/40">{r.reviewerEmail}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Stars value={r.stars} size={13} />
                    </td>
                    <td className="max-w-[260px] px-3 py-2.5 text-[12px] text-graphite/70">
                      {commentSnippet || t('noComment')}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-col gap-1">
                        <span
                          className={cn(
                            'inline-flex w-fit rounded px-1.5 py-0.5 font-mono text-[9px] uppercase',
                            r.status === 'published' ? 'bg-teal/15 text-teal' : 'bg-ink/10 text-ink/50',
                          )}
                        >
                          {t(`status.${r.status}`)}
                        </span>
                        {r.reported && (
                          <span className="inline-flex w-fit rounded bg-stampred/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-stampred">
                            {t('reportedBadge')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-ink/60">
                      {fmtDate(r.createdAt, locale)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.status === 'published' ? <ReviewActions reviewId={r.id} /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
