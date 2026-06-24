'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconCertificate, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { issueCertByEmailAction } from '@/lib/admin/actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
const fieldCls =
  'rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 font-mono text-xs text-ink ' + focusRing;

export function IssueCertForm({ courses }: { courses: { slug: string; title: string }[] }) {
  const t = useTranslations('admin.certs.issue');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [slug, setSlug] = useState(courses[0]?.slug ?? '');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const msgFor = (m?: string) =>
    m === 'user_not_found' ? t('errorUser') : m === 'course_required' || m === 'email_required' ? t('errorFields') : t('error');

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <h2 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink/55">
        <IconCertificate size={13} /> {t('title')}
      </h2>
      <p className="mt-1.5 text-[11px] leading-snug text-graphite/60">{t('help')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setMsg(null);
            const res = await issueCertByEmailAction(email, slug);
            if (res.ok) {
              setMsg({ type: 'ok', text: t('done') });
              setEmail('');
              router.refresh();
            } else {
              setMsg({ type: 'err', text: msgFor(res.message) });
            }
          });
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('email')}</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} className={cn(fieldCls, 'w-60')} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('course')}</span>
          <select value={slug} onChange={(e) => setSlug(e.target.value)} className={cn(fieldCls, 'cursor-pointer')}>
            {courses.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending || !email} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
          {pending ? <IconLoader2 size={14} className="animate-spin" /> : null}
          {t('submit')}
        </button>
      </form>
      {msg && (
        <p className={cn('mt-2 font-mono text-[11px]', msg.type === 'ok' ? 'text-teal' : 'text-stampred')} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
