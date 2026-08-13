'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconDeviceFloppy, IconLoader2, IconLink, IconArrowRight } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import type { CoursePatch } from '@/lib/courses/write';
import type { CourseResource } from '@/db/schema';
import { ResourcesEditor } from '@/components/content/ResourcesEditor';
import { MONO_LOCALE_NAME } from './fields';

type UpdateResult = { ok: boolean; message?: string };
/** Same shape as `CourseEditor`'s injected `updateAction` — the studio
 *  (Task C3-T4) passes its own owner-scoped `updateMyCourseAction` here.
 *  REQUIRED, no default (Stage 1 — no admin authoring surface exists to
 *  fall back to). */
type UpdateAction = (slug: string, patch: CoursePatch) => Promise<UpdateResult>;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * The "Ressources" tab (Task A2 — course editor UX overhaul): course-level
 * links/downloads ("liens en description" — rendered under the course
 * description on the public sales page), pulled out of `CourseEditor`'s
 * single big "Enregistrer" form into its own tab with its own save action so
 * it reads as a distinct, focused task instead of one more field buried in
 * a long form. Reuses `ResourcesEditor` (the same dumb/controlled list
 * component the lesson-level "Ressources" block uses) and the exact same
 * `updateCourseAction`/`CoursePatch` shape `CourseEditor` already used for
 * this field — only the UI moved, not the write path.
 */
export function CourseResourcesPanel({
  slug,
  resources,
  updateAction,
  bilingual = true,
  primaryLocale = 'ht',
  uploadEnabled = true,
}: {
  slug: string;
  resources: CourseResource[];
  /** REQUIRED — the studio's owner-scoped `updateMyCourseAction`. */
  updateAction: UpdateAction;
  /** The course's optional-translation setting (Stage 4 — resources were the
   *  last bilingual exception): monolingual renders ONE 'Tit lyen an' input
   *  per row, the server mirrors the other side on save. Additive defaults
   *  (`true`/`'ht'` = the pre-existing bilingual UI) keep un-updated call
   *  sites unchanged. */
  bilingual?: boolean;
  primaryLocale?: 'ht' | 'fr';
  /** Server-known `bunnyStorageConfigured()` (Stage 4) — `false` hides the
   *  document dropzone in favour of the calm link-first fallback. */
  uploadEnabled?: boolean;
}) {
  const t = useTranslations('admin.cms.editor');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [list, setList] = useState<CourseResource[]>(resources);
  const [save, setSave] = useState<SaveState>('idle');
  const [err, setErr] = useState<string | null>(null);
  const mono = bilingual ? undefined : primaryLocale;

  /** One save path for both triggers: the explicit "Anrejistre" button, and
   *  `ResourcesEditor`'s `onUploaded` auto-save (Stage 4 #5 — an uploaded
   *  document already round-tripped the server, so its row is committed
   *  immediately and the bar just shows '✓'). */
  const saveList = (next: CourseResource[]) =>
    start(async () => {
      setSave('saving');
      setErr(null);
      const res = await updateAction(slug, { resources: next });
      if (res.ok) {
        setSave('saved');
        router.refresh();
      } else {
        setSave('error');
        setErr(res.message ?? null);
      }
    });

  const onSave = () => saveList(list);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <div className="mb-2 flex items-start gap-2">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink/[0.06] text-ink/50" aria-hidden>
            <IconLink size={14} />
          </span>
          <div className="min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink/55">
              {t('resourcesLabel')}
              {mono && <span className="text-ink/40 normal-case"> · {MONO_LOCALE_NAME[mono]}</span>}
            </span>
            <p className="mt-0.5 text-[11px] leading-snug text-ink/60">{t('resourcesHelp')}</p>
          </div>
        </div>
        <div className="sm:pl-8">
          <ResourcesEditor
            label=""
            resources={list}
            onChange={(r) => {
              setList(r);
              setSave('idle');
            }}
            serverError={err?.startsWith('resource_') ? err : null}
            slug={slug}
            mono={mono}
            uploadEnabled={uploadEnabled}
            audienceNote={t('resourcesAudienceNote')}
            onUploaded={(next) => {
              setList(next);
              saveList(next);
            }}
          />
        </div>
        {/* Cross-link (Stage 1 — task-first navigation): "Resous" here used
            to collide with the per-lesson resources — say plainly where a
            STUDENT document belongs (frozen `?tab=plan` contract, relative
            client-side push — same pathname, only the query changes). */}
        <p className="mt-3 flex flex-wrap items-center gap-1 border-t border-ink/10 pt-2.5 text-[11px] leading-snug text-ink/55 sm:pl-8">
          {t('resourcesCrossLink')}
          <button
            type="button"
            onClick={() => router.push('?tab=plan')}
            className="inline-flex items-center gap-0.5 rounded font-medium text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light"
          >
            {t('resourcesCrossLinkCta')} <IconArrowRight size={12} aria-hidden />
          </button>
        </p>
      </section>

      <div className="flex items-center gap-3 rounded-xl border border-ink/12 bg-paper-light px-4 py-2.5">
        <button type="button" disabled={pending} onClick={onSave} className={cn(buttonClasses('primary', 'md'), 'text-xs')}>
          {save === 'saving' ? <IconLoader2 size={15} className="animate-spin" /> : <IconDeviceFloppy size={15} />}
          {t('save')}
        </button>
        <span
          className={cn(
            'font-mono text-[11px]',
            save === 'saved' ? 'text-teal' : save === 'error' ? 'text-stampred' : 'text-ink/45',
          )}
          role="status"
        >
          {save === 'saved' ? t('saved') : save === 'error' ? t('error') : save === 'saving' ? t('saving') : t('unsaved')}
        </span>
      </div>
    </div>
  );
}
