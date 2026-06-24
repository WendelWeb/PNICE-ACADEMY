'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { IconCircleCheck, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { submitReviewAction } from '@/lib/admin/site-actions';

const inputCls = 'w-full rounded-lg border border-ink/15 bg-paper-light px-3 py-2 text-[15px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre';

export function ReviewForm({ token, name }: { token: string; name: string }) {
  const t = useTranslations('review');
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [quote, setQuote] = useState('');
  const [lang, setLang] = useState<'ht' | 'fr'>(locale === 'fr' ? 'fr' : 'ht');
  const [photo, setPhoto] = useState('');
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl border border-teal/30 bg-teal/[0.06] p-7 text-center">
        <IconCircleCheck size={36} className="mx-auto text-teal" />
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">{t('thanksTitle')}</h1>
        <p className="mt-2 text-sm text-graphite/80">{t('thanksBody')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErr(null);
          const res = await submitReviewAction(token, quote, lang, photo.trim() || null);
          if (res.ok) setDone(true);
          else setErr(res.message === 'invalid' ? t('invalid') : t('error'));
        });
      }}
      className="space-y-4 rounded-2xl border border-ink/12 bg-paper-light p-6 sm:p-8"
    >
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{t('title', { name })}</h1>
        <p className="mt-1 text-sm text-graphite/70">{t('subtitle')}</p>
      </div>

      <div className="flex gap-1.5">
        {(['ht', 'fr'] as const).map((l) => (
          <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l}
            className={cn('rounded px-3 py-1 font-mono text-xs', lang === l ? 'bg-ink text-paper-light' : 'bg-ink/[0.06] text-ink/70')}>
            {l === 'ht' ? 'Kreyòl' : 'Français'}
          </button>
        ))}
      </div>

      <textarea value={quote} onChange={(e) => setQuote(e.target.value)} required placeholder={t('placeholder')} className={cn(inputCls, 'min-h-[120px] resize-y')} />
      <input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder={t('photo')} className={inputCls} />

      <label className="flex items-start gap-2.5 text-sm text-graphite">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-ochre" />
        <span>{t('consent')}</span>
      </label>

      {err && <p className="font-mono text-[12px] text-stampred">{err}</p>}
      <button type="submit" disabled={pending || !consent || !quote.trim()} className={cn(buttonClasses('primary', 'lg'), 'w-full')}>
        {pending ? <IconLoader2 size={16} className="animate-spin" /> : null} {t('submit')}
      </button>
    </form>
  );
}
