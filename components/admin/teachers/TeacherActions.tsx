'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconCheck, IconX, IconUserOff, IconUserCheck, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import {
  approveTeacherAction,
  rejectTeacherAction,
  suspendTeacherAction,
  reactivateTeacherAction,
  type TeacherActionResult,
} from '@/lib/teacher/admin-actions';
import type { TeacherProfile } from '@/lib/teacher/profile';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

type Feedback = { type: 'ok' | 'err'; text: string } | null;
type NoteMode = 'reject' | 'suspend' | null;

/** Approve / reject(-with-note) / suspend(-with-reason) / reactivate for one teacher row. */
export function TeacherActions({ userId, status }: { userId: string; status: TeacherProfile['status'] }) {
  const t = useTranslations('admin.teachers.actions');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [noteMode, setNoteMode] = useState<NoteMode>(null);
  const [note, setNote] = useState('');

  const run = (fn: () => Promise<TeacherActionResult>) =>
    start(async () => {
      setFeedback(null);
      const res = await fn();
      if (res.ok) {
        setFeedback({ type: 'ok', text: t('done') });
        setNoteMode(null);
        setNote('');
        router.refresh();
      } else {
        setFeedback({ type: 'err', text: t('error') });
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {(status === 'pending' || status === 'rejected') && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => approveTeacherAction(userId))}
            className={cn(buttonClasses('dark', 'sm'), 'gap-1')}
          >
            <IconCheck size={13} /> {t('approve')}
          </button>
        )}
        {status === 'pending' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setNoteMode('reject')}
            className={cn('flex items-center gap-1 rounded border border-stampred/40 px-3.5 py-1.5 text-xs font-semibold text-stampred hover:bg-stampred/10', focusRing)}
          >
            <IconX size={13} /> {t('reject')}
          </button>
        )}
        {status === 'approved' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setNoteMode('suspend')}
            className={cn('flex items-center gap-1 rounded border border-ochre/40 px-3.5 py-1.5 text-xs font-semibold text-ochre hover:bg-ochre/10', focusRing)}
          >
            <IconUserOff size={13} /> {t('suspend')}
          </button>
        )}
        {status === 'suspended' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => reactivateTeacherAction(userId))}
            className={cn('flex items-center gap-1 rounded border border-teal/40 px-3.5 py-1.5 text-xs font-semibold text-teal hover:bg-teal/10', focusRing)}
          >
            <IconUserCheck size={13} /> {t('reactivate')}
          </button>
        )}
        {pending && <IconLoader2 size={15} className="animate-spin text-ink/40" />}
      </div>
      {feedback && (
        <p className={cn('font-mono text-[11px]', feedback.type === 'ok' ? 'text-teal' : 'text-stampred')} role="status">
          {feedback.text}
        </p>
      )}

      {noteMode && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-ink">{noteMode === 'reject' ? t('reject') : t('suspend')}</h3>
              <button type="button" onClick={() => setNoteMode(null)} className={cn('text-ink/50 hover:text-ink', focusRing)} aria-label={t('cancel')}>
                <IconX size={18} />
              </button>
            </div>
            <p className="mt-2 text-xs text-graphite/70">{t('noteHelp')}</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={t('notePlaceholder')}
              className={cn('mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink', focusRing)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setNoteMode(null)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={!note.trim() || pending}
                onClick={() =>
                  run(() => (noteMode === 'reject' ? rejectTeacherAction(userId, note) : suspendTeacherAction(userId, note)))
                }
                className={cn(
                  'flex items-center gap-1.5 rounded px-4 py-2.5 text-xs font-semibold text-paper-light disabled:opacity-50',
                  noteMode === 'reject' ? 'bg-stampred' : 'bg-ochre',
                  focusRing,
                )}
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
