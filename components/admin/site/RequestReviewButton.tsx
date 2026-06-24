'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { IconMessage2Plus, IconLoader2, IconCopy } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { requestTestimonialAction } from '@/lib/admin/site-actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

export function RequestReviewButton({ userId, userName }: { userId: string; userName: string }) {
  const t = useTranslations('admin.testimonials.request');
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await requestTestimonialAction(userId, userName);
            if (res.ok && res.token) {
              setLink(`${window.location.origin}/${locale}/temoignage/${res.token}`);
            }
          })
        }
        className={cn('inline-flex items-center gap-1 rounded border border-ochre/40 px-2 py-1 font-mono text-[10px] font-medium text-ochre hover:bg-ochre/10', focusRing)}
      >
        {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconMessage2Plus size={12} />}
        {t('button')}
      </button>
      {link && (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(link)}
          title={link}
          className="inline-flex max-w-[220px] items-center gap-1 truncate font-mono text-[10px] text-teal hover:underline"
        >
          <IconCopy size={11} className="shrink-0" /> {t('copyLink')}
        </button>
      )}
    </span>
  );
}
