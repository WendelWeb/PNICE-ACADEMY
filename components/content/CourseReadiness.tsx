'use client';

import { useTranslations } from 'next-intl';
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { ReadinessItem } from '@/lib/courses/readiness';

/**
 * The "is this course actually ready?" checklist (Task K2 — plan de cours
 * complet). Rendered in BOTH the teacher studio (above `StudioStatusBar`'s
 * submit button) and the admin CMS (near `PublishBar`) — same component, same
 * `admin.cms.readiness` copy either way, exactly like `LessonsManager`/
 * `CourseEditor` reuse one namespace regardless of which page renders them.
 *
 * `items` is computed by the PAGE (a server component) via
 * `lib/courses/readiness.ts`'s `computeCourseReadiness` — this component only
 * renders it; it never re-derives readiness itself, so there is exactly one
 * place the rule lives.
 *
 * DELIBERATELY A WARNING LIST: every ✗ explains what to fix (`location`) but
 * nothing here disables a button — see the plan's own note that admin review
 * is the real gate.
 */
export function CourseReadiness({ items }: { items: ReadinessItem[] }) {
  const t = useTranslations('admin.cms.readiness');
  const missing = items.filter((i) => !i.ok).length;

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('title')}</h2>
        <span className={cn('font-mono text-[11px]', missing === 0 ? 'text-teal' : 'text-ochre')} role="status">
          {missing === 0 ? t('complete') : t('missingCount', { count: missing })}
        </span>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-xs leading-snug">
            {item.ok ? (
              <IconCircleCheck size={15} className="mt-0.5 shrink-0 text-teal" aria-hidden />
            ) : (
              <IconCircleX size={15} className="mt-0.5 shrink-0 text-stampred" aria-hidden />
            )}
            <span className={item.ok ? 'text-graphite/65' : 'text-ink'}>
              {t(`items.${item.key}.label`)}
              {!item.ok && <span className="ml-1 text-ink/45">→ {t(`items.${item.key}.location`)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
