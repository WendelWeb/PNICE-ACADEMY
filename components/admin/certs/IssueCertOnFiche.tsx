'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconCertificate, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { issueCertificateAction } from '@/lib/admin/actions';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

export function IssueCertOnFiche({
  userId,
  courses,
}: {
  userId: string;
  courses: { slug: string; title: string }[];
}) {
  const t = useTranslations('admin.certs.issue');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [slug, setSlug] = useState(courses[0]?.slug ?? '');
  const [done, setDone] = useState(false);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-3">
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink/45">
        <IconCertificate size={12} /> {t('ficheLabel')}
      </span>
      <select
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        className={cn('rounded border border-ink/15 bg-paper px-2 py-1 font-mono text-[11px] text-ink', focusRing)}
      >
        {courses.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !slug}
        onClick={() =>
          start(async () => {
            const res = await issueCertificateAction(userId, slug);
            if (res.ok) {
              setDone(true);
              router.refresh();
            }
          })
        }
        className={cn('inline-flex items-center gap-1 rounded border border-teal/40 px-2 py-1 font-mono text-[10px] font-medium text-teal hover:bg-teal/10', focusRing)}
      >
        {pending ? <IconLoader2 size={12} className="animate-spin" /> : null}
        {done ? t('done') : t('submit')}
      </button>
    </div>
  );
}
