import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import {
  IconArrowLeft,
  IconMail,
  IconCalendar,
  IconWallet,
  IconVideo,
  IconNotes,
  IconExternalLink,
} from '@tabler/icons-react';
import { getTeacherProfileForAdmin } from '@/lib/teacher/admin';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { TeacherActions } from '@/components/admin/teachers/TeacherActions';
import { fmtDate } from '@/lib/admin/format';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

const statusTone: Record<string, string> = {
  pending: 'bg-ochre/15 text-ochre',
  approved: 'bg-teal/15 text-teal',
  rejected: 'bg-stampred/15 text-stampred',
  suspended: 'bg-ink/10 text-ink/55',
};

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * `/admin/enseignants/[userId]` — the teacher-application DETAIL page (Stage
 * 7). Before this, the review queue's approve/reject/suspend buttons were
 * the ONLY way an admin engaged with an applicant — no page ever showed the
 * full bio, the photo, or the payout destination `getTeacherProfileForAdmin`
 * already exposes. Linked from the queue row's `viewDetail` action.
 */
export default async function TeacherDetailPage({
  params: { locale, userId },
}: {
  params: { locale: 'ht' | 'fr'; userId: string };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('teachers.review'))) return <Forbidden />;

  const t = await getTranslations('admin.teachers');
  const td = await getTranslations('admin.teachers.detail');
  const profile = await getTeacherProfileForAdmin(userId);
  if (!profile) notFound();

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <Link href="/admin/enseignants" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
        <IconArrowLeft size={14} /> {td('back')}
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-ink/12 bg-paper-light p-4">
        {profile.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.photoUrl} alt={td('photoAlt')} className="h-16 w-16 shrink-0 rounded-full border border-ink/12 object-cover" />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-ink/8 font-display text-lg font-bold text-ink/50">
            {(profile.displayName || profile.name || profile.email).charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-ink">{profile.displayName || profile.name || profile.email}</h1>
          <p className="font-mono text-xs text-ink/50">{profile.email}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', statusTone[profile.status])}>
            {t(`tabs.${profile.status}`)}
          </span>
          <TeacherActions userId={profile.userId} status={profile.status} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title={td('appliedAt')} icon={<IconCalendar size={13} />}>
          <p className="text-sm text-ink">{fmtDate(profile.appliedAt, locale)}</p>
        </Panel>
        <Panel title={td('videoQuota')} icon={<IconVideo size={13} />}>
          <p className="text-sm text-ink">{profile.videoQuotaMinutes != null ? `${profile.videoQuotaMinutes} min` : '—'}</p>
        </Panel>
      </div>

      <Panel title={td('bioHt')}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-graphite/85">{profile.bioHt || td('noBio')}</p>
      </Panel>
      <Panel title={td('bioFr')}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-graphite/85">{profile.bioFr || td('noBio')}</p>
      </Panel>

      <Panel title={t('col.payout')} icon={<IconWallet size={13} />}>
        {profile.payoutMethod && profile.payoutDestination ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{td('payoutMethod')}</dt>
              <dd className="text-sm text-ink">{profile.payoutMethod.toUpperCase()}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{td('payoutDestination')}</dt>
              <dd className="break-words text-sm text-ink">{profile.payoutDestination}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-graphite/60">{td('noPayout')}</p>
        )}
      </Panel>

      {profile.status === 'rejected' && profile.reviewNote && (
        <Panel title={td('reviewNoteLabel')} icon={<IconNotes size={13} />}>
          <p className="text-sm leading-relaxed text-graphite/85">{profile.reviewNote}</p>
        </Panel>
      )}

      <Panel title={td('links')} icon={<IconExternalLink size={13} />}>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <a
            href={`mailto:${profile.email}`}
            className="inline-flex items-center gap-1.5 font-mono text-[12px] text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal"
          >
            <IconMail size={13} /> {td('emailLink')}
          </a>
          {profile.slug ? (
            <Link
              href={`/prof/${profile.slug}`}
              className="inline-flex items-center gap-1.5 font-mono text-[12px] text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal"
            >
              <IconExternalLink size={13} /> {td('publicProfileLink')}
            </Link>
          ) : (
            <span className="font-mono text-[12px] text-ink/40">{td('noPublicProfile')}</span>
          )}
        </div>
      </Panel>
    </div>
  );
}
