'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  IconBan,
  IconClockHour4,
  IconNotes,
  IconRotateClockwise2,
  IconSparkles,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { Sceau } from '@/components/ui/Sceau';
import { Link } from '@/i18n/routing';
import { fmtDate } from '@/lib/admin/format';
import { ApplyWizard } from './ApplyWizard';
import type { TeacherProfile } from '@/lib/teacher/profile';

/**
 * The signed-in half of /enseigner (Task C3-T2): decides, from the current
 * user's `teacher_profiles` row (read server-side, passed down as plain
 * data), whether to show the "start your application" prompt, the wizard
 * itself, or a status card (pending/approved/rejected/suspended) — per the
 * plan's exact state machine. `profile` is `null` for a signed-in user who
 * has never applied (or whose only row hasn't landed yet, e.g. no DB).
 */
export function TeacherApplyEntry({
  profile,
  uploadEnabled = false,
}: {
  profile: TeacherProfile | null;
  /** Bunny Storage configured server-side (Stage 7) — passed straight
   *  through to `ApplyWizard`'s photo field. */
  uploadEnabled?: boolean;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);

  // No profile yet → either the "start" prompt, or (once clicked) the wizard.
  if (!profile) {
    if (!wizardOpen) {
      return <StartCard onStart={() => setWizardOpen(true)} />;
    }
    return <ApplyWizard uploadEnabled={uploadEnabled} />;
  }

  // Rejected → a re-apply button reveals the SAME wizard, prefilled.
  if (profile.status === 'rejected' && wizardOpen) {
    return (
      <ApplyWizard
        uploadEnabled={uploadEnabled}
        initial={{
          displayName: profile.displayName,
          bioHt: profile.bioHt,
          bioFr: profile.bioFr,
          photoUrl: profile.photoUrl,
          payoutMethod: profile.payoutMethod,
          payoutDestination: profile.payoutDestination,
        }}
      />
    );
  }

  switch (profile.status) {
    case 'pending':
      return <PendingCard appliedAt={profile.createdAt} />;
    case 'approved':
      return <ApprovedCard />;
    case 'suspended':
      return <SuspendedCard />;
    case 'rejected':
      return <RejectedCard reviewNote={profile.reviewNote} onReapply={() => setWizardOpen(true)} />;
    default:
      return <StartCard onStart={() => setWizardOpen(true)} />;
  }
}

function StartCard({ onStart }: { onStart: () => void }) {
  const t = useTranslations('teach.apply');
  return (
    <div className="rounded-2xl border border-ink/12 bg-paper-light p-7 text-center sm:p-10">
      <Sceau size="sm" tone="ochre" rotate={-6} className="mx-auto">
        <IconSparkles size={20} />
      </Sceau>
      <h2 className="mt-5 font-display text-2xl font-bold leading-tight text-ink">
        {t('startTitle')}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-graphite/80">
        {t('startBody')}
      </p>
      <button type="button" onClick={onStart} className={cn(buttonClasses('primary', 'lg'), 'mt-6')}>
        {t('startCta')}
      </button>
    </div>
  );
}

function StatusShell({
  icon,
  tone,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  tone: 'ink' | 'ochre' | 'red';
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ink/12 bg-paper-light p-7 text-center sm:p-10">
      <Sceau size="sm" tone={tone} rotate={-6} className="mx-auto">
        {icon}
      </Sceau>
      <h2 className="mt-5 font-display text-2xl font-bold leading-tight text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-graphite/80">{body}</p>
      {children}
    </div>
  );
}

function PendingCard({ appliedAt }: { appliedAt: string }) {
  const t = useTranslations('teach.apply');
  const locale = useLocale() as 'ht' | 'fr';
  return (
    <StatusShell
      icon={<IconClockHour4 size={20} />}
      tone="ink"
      title={t('status.pending.title')}
      body={t('status.pending.body')}
    >
      <div className="mx-auto mt-4 max-w-md rounded-lg border border-ink/10 bg-paper p-3 text-left">
        <p className="font-mono text-[11px] text-ink/60">{t('status.pending.appliedAt', { date: fmtDate(appliedAt, locale) })}</p>
        <p className="mt-1 text-xs leading-relaxed text-graphite/75">{t('status.pending.eta')}</p>
      </div>
    </StatusShell>
  );
}

function ApprovedCard() {
  const t = useTranslations('teach.apply');
  return (
    <StatusShell
      icon={<IconSparkles size={20} />}
      tone="ochre"
      title={t('status.approved.title')}
      body={t('status.approved.body')}
    >
      <Link href="/enseigner/studio" className={cn(buttonClasses('primary', 'lg'), 'mt-6')}>
        {t('status.approved.studioCta')}
      </Link>
    </StatusShell>
  );
}

function SuspendedCard() {
  const t = useTranslations('teach.apply');
  return (
    <StatusShell
      icon={<IconBan size={20} />}
      tone="red"
      title={t('status.suspended.title')}
      body={t('status.suspended.body')}
    />
  );
}

function RejectedCard({
  reviewNote,
  onReapply,
}: {
  reviewNote: string | null;
  onReapply: () => void;
}) {
  const t = useTranslations('teach.apply');
  return (
    <div className="rounded-2xl border border-ink/12 bg-paper-light p-7 text-center sm:p-10">
      <Sceau size="sm" tone="ink" rotate={-6} className="mx-auto">
        <IconNotes size={20} />
      </Sceau>
      <h2 className="mt-5 font-display text-2xl font-bold leading-tight text-ink">
        {t('status.rejected.title')}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-graphite/80">
        {t('status.rejected.body')}
      </p>
      {reviewNote && (
        <div className="mx-auto mt-4 max-w-md rounded-lg border border-ink/10 bg-paper p-4 text-left">
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
            {t('status.rejected.noteLabel')}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-graphite">{reviewNote}</p>
        </div>
      )}
      <button
        type="button"
        onClick={onReapply}
        className={cn(buttonClasses('primary', 'lg'), 'mt-6')}
      >
        <IconRotateClockwise2 size={16} />
        {t('status.rejected.reapplyCta')}
      </button>
    </div>
  );
}
