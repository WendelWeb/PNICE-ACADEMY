'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconMailCog, IconLoader2, IconDeviceFloppy } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { setDigestAction } from '@/lib/admin/support-actions';

/**
 * Daily admin digest setting (Task 6). Editable when the viewer holds
 * `support.act`; otherwise read-only (e.g. an editeur-contenu on Paramètres).
 */
export function DigestPanel({ enabled, hour, canEdit }: { enabled: boolean; hour: number; canEdit: boolean }) {
  const t = useTranslations('admin.health.digest');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(enabled);
  const [h, setH] = useState(hour);
  const [saved, setSaved] = useState(false);

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconMailCog size={13} /> {t('title')}
      </h2>
      <p className="mt-1 text-xs leading-snug text-graphite/60">{t('note')}</p>

      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); setSaved(false); }} className="h-4 w-4 accent-ochre" />
            {t('enabled')}
          </label>
          <label className="flex items-center gap-1.5 font-mono text-[11px] text-ink/55">
            {t('hour')}
            <select value={h} disabled={!on} onChange={(e) => { setH(Number(e.target.value)); setSaved(false); }} className="rounded-lg border border-ink/15 bg-paper px-2 py-1 font-mono text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-ochre disabled:opacity-40">
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { const r = await setDigestAction(on, h); if (r.ok) { setSaved(true); router.refresh(); } })}
            className={cn(buttonClasses('ghost', 'md'), 'text-xs')}
          >
            {pending ? <IconLoader2 size={14} className="animate-spin" /> : <IconDeviceFloppy size={14} />} {t('save')}
          </button>
          {saved && <span className="font-mono text-[11px] text-teal">{t('saved')}</span>}
        </div>
      ) : (
        <p className="mt-3 font-mono text-sm text-ink">
          {enabled ? t('onAt', { hour: String(hour).padStart(2, '0') }) : t('off')}
        </p>
      )}
    </section>
  );
}
