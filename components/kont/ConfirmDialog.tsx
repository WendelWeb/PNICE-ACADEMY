'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { buttonClasses } from '@/components/ui/Button';

type ConfirmOptions = {
  title: string;
  text?: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<void> | void;
};

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('kont.common');
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-ink/50" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-ink/12 bg-paper-light p-6 shadow-xl">
        <h3 className="font-display text-xl font-bold text-ink">{title}</h3>
        {text && (
          <p className="mt-2 text-sm leading-relaxed text-graphite/80">{text}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses('ghost', 'md')}
          >
            {t('cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={buttonClasses(
              'primary',
              'md',
              danger ? '!bg-stampred !text-paper-light hover:!shadow-stampred/30' : '',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reusable branded confirm flow. Returns a `confirm()` trigger + the dialog node. */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);

  const dialog = (
    <ConfirmDialog
      open={!!opts}
      title={opts?.title ?? ''}
      text={opts?.text}
      confirmLabel={opts?.confirmLabel ?? ''}
      danger={opts?.danger}
      busy={busy}
      onCancel={() => (busy ? undefined : setOpts(null))}
      onConfirm={async () => {
        if (!opts) return;
        setBusy(true);
        try {
          await opts.run();
        } finally {
          setBusy(false);
          setOpts(null);
        }
      }}
    />
  );

  return { confirm: (o: ConfirmOptions) => setOpts(o), dialog };
}
