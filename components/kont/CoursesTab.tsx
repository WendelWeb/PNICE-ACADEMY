'use client';

/**
 * /kont — "Fòmasyon mwen yo" tab (Stage: learner account). Real list of the
 * learner's courses (enrollments + pass-covered in-progress courses, the
 * same getMyLearning read the dashboard uses), each row linking straight to
 * where they left off — plus a prominent link to the full dashboard, which
 * remains the real learning home.
 */
import { useLocale, useTranslations } from 'next-intl';
import { IconArrowRight, IconBook2, IconCompass } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { SettingsCard } from './ui';

export type KontCourse = {
  slug: string;
  titleHt: string;
  titleFr: string;
  done: number;
  total: number;
  /** 1-based lesson index to resume at. */
  next: number;
};

export function CoursesTab({ courses }: { courses: KontCourse[] }) {
  const t = useTranslations('kont.courses');
  const locale = useLocale();

  return (
    <SettingsCard
      title={
        <span className="flex items-center gap-1.5">
          <IconBook2 size={14} /> {t('title')}
        </span>
      }
    >
      {courses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <IconCompass size={28} className="text-ink/25" />
          <p className="max-w-xs text-sm leading-relaxed text-graphite/70">{t('empty')}</p>
          <Link href="/formations" className={cn(buttonClasses('primary', 'md'), 'mt-1')}>
            {t('emptyCta')}
          </Link>
        </div>
      ) : (
        <>
          <ul className="-mx-5 divide-y divide-ink/8 sm:-mx-6">
            {courses.map((c) => {
              const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
              return (
                <li key={c.slug}>
                  <Link
                    href={`/tableau-de-bord/${c.slug}/lecon/${c.next}`}
                    className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-ink/[0.03] sm:px-6"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {locale === 'fr' ? c.titleFr : c.titleHt}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink/50">
                        {c.done >= c.total
                          ? t('completed')
                          : t('progress', { done: c.done, total: c.total, pct })}
                      </span>
                    </span>
                    <IconArrowRight
                      size={16}
                      className="shrink-0 text-ochre transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 border-t border-ink/10 pt-5">
            <Link href="/tableau-de-bord" className={buttonClasses('dark', 'md')}>
              {t('dashboardLink')}
              <IconArrowRight size={16} />
            </Link>
          </div>
        </>
      )}
    </SettingsCard>
  );
}
