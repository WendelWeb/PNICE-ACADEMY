'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconDeviceFloppy, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { updateCourseAction } from '@/lib/admin/content-actions';
import type { CoursePatch } from '@/lib/courses/write';
import type { CourseResource } from '@/db/schema';
import { ResourcesEditor } from '@/components/content/ResourcesEditor';

type UpdateResult = { ok: boolean; message?: string };
/** Same shape as `CourseEditor`'s injected `updateAction` — the studio
 *  (Task C3-T4) passes its own owner-scoped action here instead. */
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
  updateAction = updateCourseAction,
}: {
  slug: string;
  resources: CourseResource[];
  /** Injected by the teacher studio (Task C3-T4) as the owner-scoped
   *  `updateMyCourseAction`; defaults to the admin CMS action so every
   *  existing `/admin/cours/[slug]/editer` call site is unchanged. */
  updateAction?: UpdateAction;
}) {
  const t = useTranslations('admin.cms.editor');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [list, setList] = useState<CourseResource[]>(resources);
  const [save, setSave] = useState<SaveState>('idle');
  const [err, setErr] = useState<string | null>(null);

  const onSave = () =>
    start(async () => {
      setSave('saving');
      setErr(null);
      const res = await updateAction(slug, { resources: list });
      if (res.ok) {
        setSave('saved');
        router.refresh();
      } else {
        setSave('error');
        setErr(res.message ?? null);
      }
    });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
        <ResourcesEditor
          label={t('resourcesLabel')}
          resources={list}
          onChange={(r) => {
            setList(r);
            setSave('idle');
          }}
          serverError={err?.startsWith('resource_') ? err : null}
        />
        <p className="mt-1 text-[11px] leading-snug text-graphite/55">{t('resourcesHelp')}</p>
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
