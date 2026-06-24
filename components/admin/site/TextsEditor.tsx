'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconLanguage, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { setTextOverrideAction, resetTextOverrideAction } from '@/lib/admin/site-actions';

type TextRow = { section: string; key: string; baseHt: string; baseFr: string; ht: string; fr: string; overridden: boolean };
const inputCls = 'w-full rounded border border-ink/15 bg-paper px-2 py-1 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

export function TextsEditor({ rows }: { rows: TextRow[] }) {
  const t = useTranslations('admin.settings.texts');
  const sections = [...new Set(rows.map((r) => r.section))];

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconLanguage size={13} /> {t('title')}
      </h2>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('note')}</p>
      {sections.map((s) => (
        <div key={s} className="mt-3">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ochre">{s}</p>
          <ul className="space-y-2">
            {rows.filter((r) => r.section === s).map((r) => <Row key={r.key} row={r} t={t} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Row({ row, t }: { row: TextRow; t: (k: string) => string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ht, setHt] = useState(row.ht);
  const [fr, setFr] = useState(row.fr);
  const dirty = ht !== row.ht || fr !== row.fr;

  return (
    <li className="rounded-lg border border-ink/10 bg-paper p-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-ink/45">{row.key}</span>
        {row.overridden && <span className="rounded bg-ochre/15 px-1.5 font-mono text-[9px] uppercase text-ochre">{t('overridden')}</span>}
      </div>
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        <input value={ht} onChange={(e) => setHt(e.target.value)} placeholder="Kreyòl" className={inputCls} />
        <input value={fr} onChange={(e) => setFr(e.target.value)} placeholder="Français" className={inputCls} />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" disabled={pending || !dirty} onClick={() => start(async () => { if ((await setTextOverrideAction(row.key, ht, fr)).ok) router.refresh(); })} className="rounded border border-ink/15 px-2 py-0.5 font-mono text-[10px] text-ink/70 hover:bg-ink/[0.04] disabled:opacity-40">
          {pending ? <IconLoader2 size={10} className="animate-spin" /> : t('save')}
        </button>
        {row.overridden && (
          <button type="button" disabled={pending} onClick={() => start(async () => { if ((await resetTextOverrideAction(row.key)).ok) router.refresh(); })} className="font-mono text-[10px] text-stampred hover:underline">
            {t('reset')}
          </button>
        )}
      </div>
    </li>
  );
}
