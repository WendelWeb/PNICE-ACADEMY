'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconWorldUpload,
  IconWorldOff,
  IconTrash,
  IconLoader2,
  IconExternalLink,
  IconAlertTriangle,
  IconX,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import {
  publishCourseAction,
  unpublishCourseAction,
  deleteCourseAction,
} from '@/lib/admin/content-actions';

export function PublishBar({
  slug,
  code,
  status,
  hasUnpublishedChanges,
}: {
  slug: string;
  code: string;
  status: 'draft' | 'published';
  hasUnpublishedChanges: boolean;
}) {
  const t = useTranslations('admin.cms.publish');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmUnpub, setConfirmUnpub] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delCode, setDelCode] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; count?: number }>, okText?: string) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (res.ok) {
        setMsg(okText ? { type: 'ok', text: okText } : null);
        setConfirmUnpub(false);
        setConfirmDel(false);
        router.refresh();
      } else {
        const text =
          res.message === 'has_enrollments'
            ? t('hasEnrollments', { count: res.count ?? 0 })
            : res.message === 'code_mismatch'
              ? t('codeMismatch')
              : t('error');
        setMsg({ type: 'err', text });
      }
    });

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide', status === 'published' ? 'bg-teal/15 text-teal' : 'bg-ink/8 text-ink/60')}>
          {t(`status.${status}`)}
        </span>
        {hasUnpublishedChanges && (
          <span className="rounded bg-ochre/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ochre">{t('unpublishedChanges')}</span>
        )}

        <Link href={`/admin/cours/${slug}/apercu`} className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-ink/60 hover:text-ink">
          <IconExternalLink size={13} /> {t('preview')}
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(status === 'draft' || hasUnpublishedChanges) && (
          <button type="button" disabled={pending} onClick={() => run(() => publishCourseAction(slug), t('published'))} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
            {pending ? <IconLoader2 size={15} className="animate-spin" /> : <IconWorldUpload size={15} />}
            {status === 'draft' ? t('publish') : t('publishChanges')}
          </button>
        )}
        {status === 'published' && (
          <button type="button" disabled={pending} onClick={() => setConfirmUnpub(true)} className={cn('flex items-center gap-1.5 rounded border border-ochre/40 px-4 py-2.5 text-xs font-semibold text-ochre hover:bg-ochre/10')}>
            <IconWorldOff size={15} /> {t('unpublish')}
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 rounded border border-stampred/40 px-4 py-2.5 text-xs font-semibold text-stampred hover:bg-stampred/10">
          <IconTrash size={15} /> {t('delete')}
        </button>
      </div>

      {msg && <p className={cn('mt-2 font-mono text-[11px]', msg.type === 'ok' ? 'text-teal' : 'text-stampred')}>{msg.text}</p>}

      {/* Unpublish confirm */}
      {confirmUnpub && (
        <Modal title={t('unpublish')} onClose={() => setConfirmUnpub(false)}>
          <p className="flex items-start gap-2 text-sm text-graphite/80">
            <IconAlertTriangle size={18} className="mt-0.5 shrink-0 text-ochre" />
            {t('unpublishWarn')}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmUnpub(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('cancel')}</button>
            <button type="button" disabled={pending} onClick={() => run(() => unpublishCourseAction(slug))} className="rounded bg-ochre px-4 py-2.5 text-xs font-semibold text-[#1b1207]">{t('confirmUnpublish')}</button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <Modal title={t('delete')} onClose={() => setConfirmDel(false)}>
          <p className="text-sm text-graphite/80">{t('deleteWarn', { code })}</p>
          <input value={delCode} onChange={(e) => setDelCode(e.target.value)} placeholder={code} className="mt-3 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-mono text-sm text-ink" />
          {msg?.type === 'err' && <p className="mt-2 font-mono text-[11px] text-stampred">{msg.text}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDel(false)} className={cn(buttonClasses('ghost', 'md'), 'text-xs')}>{t('cancel')}</button>
            <button type="button" disabled={pending || delCode.trim().toUpperCase() !== code.toUpperCase()} onClick={() => run(() => deleteCourseAction(slug, delCode))} className="rounded bg-stampred px-4 py-2.5 text-xs font-semibold text-paper-light disabled:opacity-40">{t('confirmDelete')}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper-light p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-ink">{title}</h3>
          <button type="button" onClick={onClose} className="text-ink/50 hover:text-ink"><IconX size={18} /></button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
