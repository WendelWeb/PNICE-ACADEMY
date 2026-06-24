'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconGift, IconLoader2, IconDeviceFloppy } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { setReferralCreditAction } from '@/lib/admin/marketing-actions';

const inputCls =
  'w-24 rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

/**
 * Referral credit per confirmed filleul. Editable when the viewer holds
 * `users.act`; otherwise read-only (e.g. an editeur-contenu reaching Paramètres).
 */
export function ReferralCreditPanel({ currentUsd, canEdit }: { currentUsd: number; canEdit: boolean }) {
  const t = useTranslations('admin.marketing.referrals');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(String(currentUsd));
  const [saved, setSaved] = useState(false);

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconGift size={13} /> {t('config.title')}
      </h2>
      <p className="mt-1 text-xs leading-snug text-graphite/60">{t('config.note')}</p>

      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-ink/70">$</span>
          <input
            type="number"
            min={0}
            step="0.5"
            value={value}
            onChange={(e) => { setValue(e.target.value); setSaved(false); }}
            className={inputCls}
            aria-label={t('config.amount')}
          />
          <span className="font-mono text-[11px] text-ink/45">{t('config.perFilleul')}</span>
          <button
            type="button"
            disabled={pending || !Number.isFinite(Number(value)) || Number(value) < 0}
            onClick={() =>
              start(async () => {
                const r = await setReferralCreditAction(Number(value));
                if (r.ok) { setSaved(true); router.refresh(); }
              })
            }
            className={cn(buttonClasses('ghost', 'md'), 'text-xs')}
          >
            {pending ? <IconLoader2 size={14} className="animate-spin" /> : <IconDeviceFloppy size={14} />} {t('config.save')}
          </button>
          {saved && <span className="font-mono text-[11px] text-teal">{t('config.saved')}</span>}
        </div>
      ) : (
        <p className="mt-3 font-mono text-lg font-semibold text-ink tabular-nums">
          ${currentUsd} <span className="font-mono text-[11px] font-normal text-ink/45">{t('config.perFilleul')}</span>
        </p>
      )}
    </section>
  );
}
