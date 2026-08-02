'use client';

import { useTranslations } from 'next-intl';
import { IconCircleCheck, type Icon as TablerIcon } from '@tabler/icons-react';

/**
 * Shared styling primitives + small pure helpers for the course PLAN EDITOR
 * (Task A2). Extracted from the pre-split `LessonsManager.tsx` so
 * `PlanEditor`/`ChapterGroup`/`LessonRow`/`LessonEditPanel` share one
 * definition instead of four copies.
 */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
export const iconBtn =
  'grid h-6 w-6 place-items-center rounded border border-ink/15 text-ink/55 hover:bg-ink/[0.04] disabled:opacity-30 ' +
  focusRing;

export function secToMmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
export function mmssToSec(v: string): number {
  const [m, s] = v.split(':').map((x) => Number(x) || 0);
  return v.includes(':') ? m * 60 + (s || 0) : Number(v) || 0;
}

/**
 * A labelled sub-block inside the expanded lesson panel (Task A2 #4 —
 * "Titres" / "Description" / "Vidéo" / "Notes pour l'élève" / "Ressources").
 *
 * Task D2 — "anatomie d'un champ": since this panel groups lesson fields by
 * SECTION rather than one-field-at-a-time (unlike `CourseEditor`'s flat
 * list), the section header IS the field's plain-language label — so the
 * same anatomy (icon, one-line "why this matters", real example, teal ✓)
 * attaches here instead of wrapping each input a second time with
 * `fields.tsx`'s `Field` (which would just repeat the same label under
 * itself). `icon`/`hint`/`example`/`filled` are all optional so sections that
 * don't map to one clear field (Vidéo groups the dropzone + duration +
 * preview toggle; Ressources has its own list-level empty/hint copy) can
 * keep passing just `title`.
 */
export function EditPanelSection({
  title,
  extra,
  icon: Icon,
  hint,
  example,
  filled,
  id,
  children,
}: {
  title: React.ReactNode;
  /** Optional right-aligned control in the section's header row (e.g. the
   *  "move to chapter" select next to "Titres"). */
  extra?: React.ReactNode;
  icon?: TablerIcon;
  hint?: string;
  example?: string;
  filled?: boolean;
  /** Stable jump-target anchor (Stage 1 — `lesson-<id>-video` /
   *  `lesson-<id>-resources`): placed on the section's own wrapper so
   *  `jumpToAnchor` lands on the whole labelled block. Additive — omitted
   *  everywhere a section isn't a jump target. */
  id?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('common');
  return (
    <div id={id} className="rounded-lg border border-ink/10 bg-paper-light/70 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-1.5">
        <div className="flex items-start gap-1.5">
          {Icon && (
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-ink/[0.06] text-ink/45" aria-hidden>
              <Icon size={12} />
            </span>
          )}
          <div className="min-w-0">
            <h4 className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink/50">
              {title}
              {filled && <IconCircleCheck size={12} className="shrink-0 text-teal" aria-hidden />}
            </h4>
            {hint && <p className="mt-0.5 text-[11px] font-normal normal-case leading-snug text-ink/60">{hint}</p>}
          </div>
        </div>
        {extra}
      </div>
      {children}
      {example && (
        <p className="mt-1.5 text-[11px] italic leading-snug text-ink/40">
          {t('example')} : « {example} »
        </p>
      )}
    </div>
  );
}
