'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { IconFlag } from '@tabler/icons-react';
import { reportReviewAction } from '@/lib/reviews/actions';

/** Per-review "report" link on the course sales page (Task C3-T6). Files a
 *  support ticket admin already sees in the existing /admin/support queue —
 *  see lib/reviews/actions.ts's `reportReviewAction` header. */
export function ReportButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations('reviews.report');
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<'idle' | 'confirm' | 'done' | 'error'>('idle');

  function onClick() {
    if (state === 'idle') {
      setState('confirm');
      return;
    }
    startTransition(async () => {
      const res = await reportReviewAction(reviewId);
      setState(res.ok ? 'done' : 'error');
    });
  }

  if (state === 'done') {
    return <span className="font-mono text-[10px] text-teal">{t('done')}</span>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink/35 transition-colors hover:text-stampred disabled:opacity-50"
    >
      <IconFlag size={11} />
      {state === 'confirm' ? t('confirm') : state === 'error' ? t('error') : t('action')}
    </button>
  );
}
