'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { useRouter } from '@/i18n/routing';
import { EDITOR_STEPS, type EditorStepKey } from '@/lib/courses/readiness-anchors';
import { hasActiveUploads } from '@/components/content/uploadActivity';
import { STEP_ICONS, STEP_GLYPH } from './steps';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * The editor's ALWAYS-VISIBLE step navigation on phones (Stage 1 — task-first
 * navigation). Before this, the only way to reach step ② on mobile was a
 * collapsed `<details>` most teachers never opened — so the video step was
 * effectively invisible on the very devices our teachers use. This bar shows
 * the 4 steps permanently (icon + short label + step number, ≥44px touch
 * targets) and navigates EXACTLY like `ControlRail`'s step buttons: same
 * `?tab=` URLs, same frozen keys.
 *
 * NOW VISIBLE AT ALL SIZES (owner: « il n'y a pas de partie contenu du
 * cours » — while looking at an editor whose step ② IS that part): on
 * desktop the only step navigation used to be the ControlRail, which reads
 * as a CHECKLIST (« Bon de kontwòl »), not as tabs — the owner himself
 * never found step ②. Four permanent tab buttons, full step titles from
 * `lg:` up, is the fix; the rail stays what it looks like: a checklist.
 *
 * ALWAYS visible for real (review fix): the bar renders INSIDE
 * `BordereauHeader`'s sticky container (the editor page slots it in as
 * children), so it stays pinned with the header while a long plan scrolls —
 * in normal flow it scrolled off-screen and a teacher deep in step ② had to
 * scroll all the way back up to switch steps. Switching steps while a video
 * upload is in flight asks for confirmation first (`hasActiveUploads`) —
 * the `?tab=` swap unmounts the plan and would kill the upload.
 */
export function MobileStepBar({
  activeTab,
  basePath,
}: {
  activeTab: EditorStepKey;
  basePath: string;
}) {
  const t = useTranslations('teach.studio.editor');
  const router = useRouter();

  // Explicit `?tab=` always — see ControlRail's hrefForStep note (the bare
  // path is the smart landing).
  const hrefForStep = (step: EditorStepKey) => `${basePath}?tab=${step}`;

  return (
    <nav
      aria-label={t('stepsNav')}
      className="-mx-4 -mb-3 mt-2 border-t border-ink/12 px-1 sm:px-2"
    >
      <div className="grid grid-cols-4">
        {EDITOR_STEPS.map(({ key, number }) => {
          const Icon = STEP_ICONS[key];
          const active = key === activeTab;
          return (
            <button
              key={key}
              type="button"
              aria-current={active ? 'step' : undefined}
              aria-label={t(`steps.${key}.title`)}
              onClick={() => {
                if (active) return;
                // Review fix: the `?tab=` swap unmounts the plan editor and
                // kills any in-flight video upload — never silently.
                if (hasActiveUploads() && !window.confirm(t('uploadLeaveConfirm'))) return;
                router.push(hrefForStep(key));
              }}
              className={cn(
                'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-t border-b-2 px-1 py-2',
                focusRing,
                active
                  ? 'border-ochre font-semibold text-ink'
                  : 'border-transparent text-ink/50 hover:text-ink',
              )}
            >
              <span className="flex items-center gap-1">
                <span aria-hidden className={cn('font-mono text-[10px] leading-none', active ? 'text-ochre' : 'text-ink/40')}>
                  {STEP_GLYPH[number]}
                </span>
                <Icon size={16} aria-hidden className={active ? 'text-ochre' : undefined} />
              </span>
              <span className="font-mono text-[9px] uppercase leading-none tracking-wide lg:hidden">
                {t(`steps.${key}.short`)}
              </span>
              {/* Desktop earns the FULL step title — « Leson ak videyo yo »
                  says what lives behind the tab; a 9px abbreviation
                  doesn't. */}
              <span className="hidden font-mono text-[11px] uppercase leading-none tracking-wide lg:block">
                {t(`steps.${key}.title`)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
