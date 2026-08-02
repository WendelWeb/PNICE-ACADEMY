'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { useRouter } from '@/i18n/routing';
import { EDITOR_STEPS, type EditorStepKey } from '@/lib/courses/readiness-anchors';
import { STEP_ICONS, STEP_GLYPH } from './steps';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';

/**
 * The editor's ALWAYS-VISIBLE step navigation on phones (Stage 1 — task-first
 * navigation). Before this, the only way to reach step ② on mobile was a
 * collapsed `<details>` most teachers never opened — so the video step was
 * effectively invisible on the very devices our teachers use. This bar shows
 * the 4 steps permanently (icon + short label + step number, ≥44px touch
 * targets) right under the sticky `BordereauHeader`, and navigates EXACTLY
 * like `ControlRail`'s step buttons: same `?tab=` URLs, same frozen keys.
 * Hidden from `lg:` up, where the desktop rail already shows the steps.
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

  const hrefForStep = (step: EditorStepKey) => (step === 'infos' ? basePath : `${basePath}?tab=${step}`);

  return (
    <nav
      aria-label={t('stepsNav')}
      className="-mx-4 border-b border-ink/12 bg-paper-light px-1 sm:mx-0 sm:rounded-xl sm:border sm:px-2 lg:hidden"
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
                if (!active) router.push(hrefForStep(key));
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
              <span className="font-mono text-[9px] uppercase leading-none tracking-wide">
                {t(`steps.${key}.short`)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
