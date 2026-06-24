'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { mergeParams } from '@/lib/admin/users-query';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

export function ActiveLearnersFilter({ courses }: { courses: { slug: string; title: string }[] }) {
  const t = useTranslations('admin.engagement.active');
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const days = sp.get('days') === '30' ? '30' : '7';
  const course = sp.get('course') ?? '';

  const go = (patch: Record<string, string | null>) =>
    router.push(pathname + mergeParams(new URLSearchParams(sp.toString()), { ...patch, page: null }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1">
        {(['7', '30'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => go({ days: d })}
            aria-pressed={days === d}
            className={cn(
              'rounded px-2.5 py-1 font-mono text-[11px] transition-colors motion-reduce:transition-none',
              focusRing,
              days === d ? 'bg-ink text-paper-light' : 'bg-ink/[0.06] text-ink/70 hover:bg-ink/10',
            )}
          >
            {t('lastDays', { days: d })}
          </button>
        ))}
      </div>
      <select
        value={course}
        onChange={(e) => go({ course: e.target.value || null })}
        aria-label={t('courseFilter')}
        className={cn('rounded-lg border border-ink/15 bg-paper-light px-2.5 py-1 font-mono text-[11px] text-ink', focusRing)}
      >
        <option value="">{t('allCourses')}</option>
        {courses.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.title}
          </option>
        ))}
      </select>
    </div>
  );
}
