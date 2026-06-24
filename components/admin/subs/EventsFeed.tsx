import { getTranslations } from 'next-intl/server';
import {
  IconSparkles,
  IconRefresh,
  IconCircleX,
  IconAlertTriangle,
  IconMail,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { fmtUsdCents, fmtDateTime } from '@/lib/admin/format';
import type { SubEvent, SubEventType } from '@/lib/admin/data';

const ICON: Record<SubEventType, React.ReactNode> = {
  new: <IconSparkles size={14} className="text-teal" />,
  renewed: <IconRefresh size={14} className="text-teal" />,
  canceled: <IconCircleX size={14} className="text-ink/45" />,
  failed: <IconAlertTriangle size={14} className="text-stampred" />,
  reminder: <IconMail size={14} className="text-ochre" />,
};

export async function EventsFeed({ events, locale }: { events: SubEvent[]; locale: 'ht' | 'fr' }) {
  const t = await getTranslations('admin.subs');

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('events.title')}</h2>
      {events.length === 0 ? (
        <p className="mt-3 font-mono text-xs text-graphite/55">{t('events.empty')}</p>
      ) : (
        <ol className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5">
              <span className="mt-0.5">{ICON[e.type]}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink/85">
                  <span className={cn('font-medium', e.type === 'failed' && 'text-stampred')}>
                    {t(`events.type.${e.type}`)}
                  </span>{' '}
                  — {e.userName}
                </span>
                <span className="font-mono text-[10px] text-ink/45 tabular-nums">
                  {fmtDateTime(e.at, locale)} · {t(`provider.${e.provider}`)} · {fmtUsdCents(e.amountCents)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
