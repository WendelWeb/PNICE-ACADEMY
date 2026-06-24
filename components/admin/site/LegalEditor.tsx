'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconGavel, IconLoader2, IconHistory, IconExternalLink } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import { saveLegalAction } from '@/lib/admin/site-actions';
import type { LegalSlug, LegalVersion } from '@/lib/admin/site/store';

type Page = { slug: LegalSlug; content_ht: string; content_fr: string; versions: LegalVersion[] };
const areaCls = 'w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 font-mono text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

export function LegalEditor({ pages, locale }: { pages: Page[]; locale: 'ht' | 'fr' }) {
  const t = useTranslations('admin.settings.legal');
  const [active, setActive] = useState<LegalSlug>(pages[0]?.slug ?? 'cgu');
  const page = pages.find((p) => p.slug === active)!;

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconGavel size={13} /> {t('title')}
      </h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pages.map((p) => (
          <button key={p.slug} type="button" onClick={() => setActive(p.slug)} aria-pressed={active === p.slug}
            className={cn('rounded px-2.5 py-1 font-mono text-[11px]', active === p.slug ? 'bg-ink text-paper-light' : 'bg-ink/[0.06] text-ink/70 hover:bg-ink/10')}>
            {t(`page.${p.slug}`)}
          </button>
        ))}
        <Link href={`/legal/${active}`} className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-ink/55 hover:text-ink">
          <IconExternalLink size={12} /> {t('view')}
        </Link>
      </div>
      <LegalForm key={active} page={page} t={t} locale={locale} />
    </section>
  );
}

function LegalForm({ page, t, locale }: { page: Page; t: (k: string, v?: Record<string, string>) => string; locale: 'ht' | 'fr' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ht, setHt] = useState(page.content_ht);
  const [fr, setFr] = useState(page.content_fr);
  const [saved, setSaved] = useState(false);

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] text-graphite/60">{t('markdownNote')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block"><span className="mb-0.5 block font-mono text-[9px] uppercase text-ink/40">Kreyòl</span><textarea value={ht} onChange={(e) => { setHt(e.target.value); setSaved(false); }} className={cn(areaCls, 'min-h-[180px] resize-y')} /></label>
        <label className="block"><span className="mb-0.5 block font-mono text-[9px] uppercase text-ink/40">Français</span><textarea value={fr} onChange={(e) => { setFr(e.target.value); setSaved(false); }} className={cn(areaCls, 'min-h-[180px] resize-y')} /></label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => { if ((await saveLegalAction(page.slug, ht, fr)).ok) { setSaved(true); router.refresh(); } })} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
          {pending ? <IconLoader2 size={14} className="animate-spin" /> : null} {t('save')}
        </button>
        {saved && <span className="font-mono text-[11px] text-teal">{t('saved')}</span>}
      </div>

      {page.versions.length > 1 && (
        <div className="mt-4 border-t border-ink/10 pt-3">
          <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink/45"><IconHistory size={12} /> {t('history')}</p>
          <ul className="mt-1.5 space-y-1">
            {page.versions.slice(1, 5).map((v, i) => (
              <li key={i} className="font-mono text-[10px] text-ink/55">
                {new Date(v.updatedAt).toLocaleString(locale === 'ht' ? 'fr' : locale, { dateStyle: 'short', timeStyle: 'short' })} · {v.adminName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
