'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconTrash, IconAlertTriangle, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { AdminLesson, AdminChapter, LessonPatch } from '@/lib/courses/write';
import type { CourseResource } from '@/db/schema';
import { VideoUpload } from '@/components/content/VideoUpload';
import { ResourcesEditor } from '@/components/content/ResourcesEditor';
import { inputCls, MONO_LOCALE_NAME } from '../fields';
import { focusRing, secToMmss, mmssToSec, EditPanelSection } from './shared';
import type { LessonActions } from './types';

/**
 * The EXPANDED lesson editing surface (Task A2 #4) — everything `LessonRow`
 * used to render inline, now grouped into labelled sub-blocks (Titres,
 * Description, Vidéo, Notes pour l'élève, Ressources) and only mounted while
 * that lesson's row is the one open (see `PlanEditor`'s accordion state).
 * Mounting fresh each time it opens is deliberate: every field's local state
 * re-initializes from the latest `lesson` prop, the same dirty-check-on-blur
 * commit pattern the pre-split `LessonsManager.tsx` used.
 *
 * `bilingual`/`primaryLocale` (Task: lesson-language) — the PARENT COURSE's
 * optional-translation setting, threaded down from the editor page →
 * `PlanEditor` → `ChapterGroup`/`LessonRow` → here as plain data props (the
 * `actions` DI contract is untouched). When the course is monolingual
 * (`bilingual === false`), the Titres/Description/Notes sections each render
 * a SINGLE input for the course's `primaryLocale` — same `mono` convention
 * `components/admin/content/CourseEditor.tsx`'s `BilingualText`/`PairedList`
 * use, right down to reusing `MONO_LOCALE_NAME` for the "· Kreyòl"/
 * "· Français" hint — instead of forcing a teacher who chose "kreyòl only"
 * for the course to still fill in French on every lesson. The client only
 * ever commits the PRIMARY locale's own field (e.g. `{ title_ht }`); the
 * server (`lib/courses/write.ts`'s `updateLesson` → `mirrorBilingualFields`)
 * is what actually copies it into the other column on save — this component
 * never needs to know that, same division as the course-level fields.
 */
export function LessonEditPanel({
  slug,
  lesson,
  isDraft,
  actions,
  chapters,
  bilingual,
  primaryLocale,
  onAct,
}: {
  slug: string;
  lesson: AdminLesson;
  isDraft: boolean;
  actions: LessonActions;
  chapters: AdminChapter[];
  bilingual: boolean;
  primaryLocale: 'ht' | 'fr';
  onAct: (fn: () => Promise<{ ok: boolean }>) => void;
}) {
  const t = useTranslations('admin.cms.lessons');
  const router = useRouter();
  const mono = bilingual ? undefined : primaryLocale;
  const [titleHt, setTitleHt] = useState(lesson.title_ht);
  const [titleFr, setTitleFr] = useState(lesson.title_fr);
  const [descHt, setDescHt] = useState(lesson.desc_ht);
  const [descFr, setDescFr] = useState(lesson.desc_fr);
  const [dur, setDur] = useState(secToMmss(lesson.durationSeconds));
  const [notesHt, setNotesHt] = useState(lesson.notes_ht);
  const [notesFr, setNotesFr] = useState(lesson.notes_fr);
  const [resources, setResources] = useState<CourseResource[]>(lesson.resources);
  const [resourcesErr, setResourcesErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rp, rStart] = useTransition();

  const noVideo = !lesson.bunnyVideoId;
  const commit = (patch: LessonPatch) => onAct(() => actions.updateLesson(slug, lesson.id, patch));

  /** Section header (Task: lesson-language) — appends the "· Kreyòl"/
   *  "· Français" hint next to a section's title when the course is
   *  monolingual, matching CourseEditor's per-field label pattern at the
   *  section level (this panel groups fields by section, not per-field). */
  const sectionTitle = (label: string) =>
    mono ? (
      <>
        {label} <span className="text-ink/40 normal-case">· {MONO_LOCALE_NAME[mono]}</span>
      </>
    ) : (
      label
    );

  /**
   * `resources` is an array field — there's no single input to "blur" the
   * way a scalar text field has, so it commits when focus leaves the WHOLE
   * notes/resources block (the wrapping `onBlur` below checks
   * `relatedTarget` is actually outside the container, the standard
   * a11y-safe "focus really left this subtree" check).
   */
  const commitResources = (next: CourseResource[]) =>
    rStart(async () => {
      const res = await actions.updateLesson(slug, lesson.id, { resources: next });
      if (res.ok) {
        setResourcesErr(null);
        router.refresh();
      } else {
        setResourcesErr(res.message ?? 'error');
      }
    });

  return (
    <div className="mt-2 space-y-2">
      <EditPanelSection
        title={sectionTitle(t('sectionTitles'))}
        extra={
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-ink/55">
            {t('moveTo')}
            <select
              value={lesson.chapterId ?? ''}
              onChange={(e) => onAct(() => actions.moveLessonToChapter(slug, lesson.id, e.target.value || null))}
              className={cn(inputCls, 'w-auto cursor-pointer py-1 font-mono text-[11px]')}
            >
              <option value="">{t('ungrouped')}</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.title_ht || c.title_fr || `#${c.sortOrder}`}</option>
              ))}
            </select>
          </label>
        }
      >
        {mono ? (
          mono === 'ht' ? (
            <input value={titleHt} onChange={(e) => setTitleHt(e.target.value)} onBlur={() => titleHt !== lesson.title_ht && commit({ title_ht: titleHt })} placeholder={t('titleHt')} className={inputCls} />
          ) : (
            <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} onBlur={() => titleFr !== lesson.title_fr && commit({ title_fr: titleFr })} placeholder={t('titleFr')} className={inputCls} />
          )
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input value={titleHt} onChange={(e) => setTitleHt(e.target.value)} onBlur={() => titleHt !== lesson.title_ht && commit({ title_ht: titleHt })} placeholder={t('titleHt')} className={inputCls} />
            <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} onBlur={() => titleFr !== lesson.title_fr && commit({ title_fr: titleFr })} placeholder={t('titleFr')} className={inputCls} />
          </div>
        )}
      </EditPanelSection>

      <EditPanelSection title={sectionTitle(t('sectionDescription'))}>
        {mono ? (
          mono === 'ht' ? (
            <textarea value={descHt} onChange={(e) => setDescHt(e.target.value)} onBlur={() => descHt !== lesson.desc_ht && commit({ desc_ht: descHt })} placeholder={t('descHt')} className={cn(inputCls, 'min-h-[44px] resize-y')} />
          ) : (
            <textarea value={descFr} onChange={(e) => setDescFr(e.target.value)} onBlur={() => descFr !== lesson.desc_fr && commit({ desc_fr: descFr })} placeholder={t('descFr')} className={cn(inputCls, 'min-h-[44px] resize-y')} />
          )
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            <textarea value={descHt} onChange={(e) => setDescHt(e.target.value)} onBlur={() => descHt !== lesson.desc_ht && commit({ desc_ht: descHt })} placeholder={t('descHt')} className={cn(inputCls, 'min-h-[44px] resize-y')} />
            <textarea value={descFr} onChange={(e) => setDescFr(e.target.value)} onBlur={() => descFr !== lesson.desc_fr && commit({ desc_fr: descFr })} placeholder={t('descFr')} className={cn(inputCls, 'min-h-[44px] resize-y')} />
          </div>
        )}
      </EditPanelSection>

      <EditPanelSection title={t('sectionVideo')}>
        <VideoUpload
          lessonTitle={titleHt || titleFr || lesson.title_ht || lesson.title_fr}
          initialVideoId={lesson.bunnyVideoId}
          createUpload={(title) => actions.createUpload(slug, lesson.id, title)}
          validateBunnyVideo={(videoId) => actions.validateBunnyVideo(videoId)}
          onUploaded={(guid) => commit({ bunnyVideoId: guid })}
          onManualIdCommit={(guid) => commit({ bunnyVideoId: guid })}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-ink/55">
            {t('duration')}
            <input value={dur} onChange={(e) => setDur(e.target.value)} onBlur={() => commit({ durationSeconds: mmssToSec(dur) })} placeholder="mm:ss" className={cn(inputCls, 'w-16 text-center')} />
          </label>
          <label className="flex items-center gap-1 font-mono text-[10px] text-ink/60">
            <input type="checkbox" checked={lesson.isPreview} onChange={(e) => commit({ isPreview: e.target.checked })} className="h-3.5 w-3.5 accent-ochre" />
            {t('preview')}
          </label>
        </div>
        {noVideo && !isDraft && (
          <p className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-stampred"><IconAlertTriangle size={11} /> {t('noVideoWarn')}</p>
        )}
      </EditPanelSection>

      <EditPanelSection title={sectionTitle(t('notesTitle'))}>
        {mono ? (
          mono === 'ht' ? (
            <textarea value={notesHt} onChange={(e) => setNotesHt(e.target.value)} onBlur={() => notesHt !== lesson.notes_ht && commit({ notes_ht: notesHt })} placeholder={t('notesHt')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
          ) : (
            <textarea value={notesFr} onChange={(e) => setNotesFr(e.target.value)} onBlur={() => notesFr !== lesson.notes_fr && commit({ notes_fr: notesFr })} placeholder={t('notesFr')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
          )
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            <textarea value={notesHt} onChange={(e) => setNotesHt(e.target.value)} onBlur={() => notesHt !== lesson.notes_ht && commit({ notes_ht: notesHt })} placeholder={t('notesHt')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
            <textarea value={notesFr} onChange={(e) => setNotesFr(e.target.value)} onBlur={() => notesFr !== lesson.notes_fr && commit({ notes_fr: notesFr })} placeholder={t('notesFr')} className={cn(inputCls, 'min-h-[60px] resize-y')} />
          </div>
        )}
      </EditPanelSection>

      <EditPanelSection
        title={
          <span className="inline-flex items-center gap-1.5">
            {t('sectionResources')} {rp && <IconLoader2 size={11} className="animate-spin text-ink/40" />}
          </span>
        }
      >
        <div
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              if (JSON.stringify(resources) !== JSON.stringify(lesson.resources)) commitResources(resources);
            }
          }}
        >
          {/* `label=""` suppresses ResourcesEditor's own default heading —
              `EditPanelSection` above already supplies the "Ressources"
              label, so rendering both would double it up. */}
          <ResourcesEditor label="" resources={resources} onChange={setResources} serverError={resourcesErr} />
        </div>
      </EditPanelSection>

      <div className="flex justify-end">
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className={cn('inline-flex items-center gap-1 font-mono text-[10px] text-stampred hover:underline', focusRing)}
          >
            <IconTrash size={12} /> {t('deleteLesson')}
          </button>
        ) : (
          <div className="rounded-lg border border-stampred/30 bg-stampred/5 p-2.5 text-right">
            <p className="text-left text-xs leading-snug text-graphite/80">{t('deleteLessonConfirm')}</p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onAct(() => actions.deleteLesson(slug, lesson.id))}
                className={cn('rounded bg-stampred px-2.5 py-1 font-mono text-[10px] font-semibold text-paper-light', focusRing)}
              >
                {t('deleteLessonYes')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className={cn('rounded border border-ink/15 px-2.5 py-1 font-mono text-[10px] text-ink/60 hover:bg-ink/[0.04]', focusRing)}
              >
                {t('deleteLessonNo')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
