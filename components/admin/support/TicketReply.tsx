'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { IconSend, IconLoader2, IconTemplate } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { replyTicketAction } from '@/lib/admin/support-actions';
import type { SupportTemplate } from '@/lib/admin/data';

export function TicketReply({
  ticketId,
  templates,
  canAct,
}: {
  ticketId: string;
  templates: SupportTemplate[];
  canAct: boolean;
}) {
  const t = useTranslations('admin.support');
  const locale = useLocale() as 'ht' | 'fr';
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (!canAct) return null;

  const applyTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    if (tpl) setBody(locale === 'ht' ? tpl.body_ht : tpl.body_fr);
  };

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('detail.reply')}</h2>
        {templates.length > 0 && (
          <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink/50">
            <IconTemplate size={13} /> {t('detail.useTemplate')}
            <select
              defaultValue=""
              onChange={(e) => { applyTemplate(e.target.value); e.currentTarget.value = ''; }}
              className="rounded-lg border border-ink/15 bg-paper px-2 py-1 font-mono text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-ochre"
            >
              <option value="" disabled>{t('detail.pickTemplate')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  [{tpl.category}] {locale === 'ht' ? tpl.title_ht : tpl.title_fr}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('detail.replyPlaceholder')}
        className="mt-3 min-h-[120px] w-full resize-y rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ochre"
      />

      {err && <p className="mt-1.5 font-mono text-[11px] text-stampred">{err}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !body.trim()}
          onClick={() =>
            start(async () => {
              setErr(null);
              const r = await replyTicketAction(ticketId, body);
              if (r.ok) { setBody(''); router.refresh(); }
              else setErr(r.message ?? 'error');
            })
          }
          className={cn(buttonClasses('primary', 'md'), 'text-xs')}
        >
          {pending ? <IconLoader2 size={14} className="animate-spin" /> : <IconSend size={14} />} {t('detail.replyAndNotify')}
        </button>
        <span className="font-mono text-[10px] text-ink/40">{t('detail.emailNote')}</span>
      </div>
    </section>
  );
}
