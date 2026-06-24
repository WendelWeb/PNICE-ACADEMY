'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconMailFast, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { sendEngagementReminderAction } from '@/lib/admin/actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper';

export function StuckReminderButton({ userId }: { userId: string }) {
  const t = useTranslations('admin.engagement.stuck');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          const res = await sendEngagementReminderAction(userId);
          if (res.ok) {
            setDone(true);
            router.refresh();
          }
        })
      }
      className={cn(
        'inline-flex items-center gap-1 rounded border border-ochre/40 px-2 py-1 font-mono text-[10px] font-medium text-ochre hover:bg-ochre/10 disabled:opacity-60',
        focusRing,
      )}
    >
      {pending ? <IconLoader2 size={12} className="animate-spin" /> : <IconMailFast size={12} />}
      {done ? t('sent') : t('remind')}
    </button>
  );
}
