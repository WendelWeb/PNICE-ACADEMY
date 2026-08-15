'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconPlus, IconLoader2, IconBooks, IconInfoCircle, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { beginUploadActivity, endUploadActivity } from '@/components/content/uploadActivity';
import type { AdminLesson, AdminChapter } from '@/lib/courses/write';
import { focusRing } from './shared';
import { ChapterGroup } from './ChapterGroup';
import { LessonRow } from './LessonRow';
import type { LessonActions, LessonUploadInfo, VideoUploadPhase } from './types';

export type { LessonActions } from './types';

/**
 * The course PLAN EDITOR (Task K2 — plan de cours complet; split into
 * focused components under Task A2 — course editor UX overhaul, formerly
 * one 539-line `LessonsManager.tsx`): chapters as groups, each with its own
 * lessons, plus an "hors chapitre" bucket for lessons with `chapterId ===
 * null`. Exported as `LessonsManager` from the sibling `../LessonsManager.tsx`
 * shim (Task A2 constraint: keep the existing exported entry point name/props
 * for the teacher studio's `/enseigner/studio/cours/[slug]/editer` — the
 * ONLY call site since Stage 1 (the admin no longer authors course
 * content) — needing no import-path or prop changes, only its own
 * already-injected `actions` object.
 *
 * BACKWARD COMPATIBLE BY CONSTRUCTION: a course with zero chapters has every
 * lesson's `chapterId === null` (see db/schema.ts's file header), so it
 * renders as a single flat "hors chapitre" bucket with NO chapter heading
 * (`chapters.length === 0` hides the "Hors chapitre" label entirely) — same
 * `LessonRow` list, same up/down/delete, same empty state as before Task A2.
 *
 * Task A2 #4 — lessons collapsed by default, ONE expanded at a time
 * (accordion): `expandedId` lives HERE (not per-`ChapterGroup`) so opening a
 * lesson in one chapter collapses whatever was open in another chapter or in
 * the ungrouped bucket — a single, obvious "what's open" story across the
 * whole plan.
 */
export function PlanEditor({
  slug,
  lessons,
  chapters = [],
  isDraft,
  bilingual = true,
  primaryLocale = 'ht',
  uploadEnabled = true,
  actions,
}: {
  slug: string;
  lessons: AdminLesson[];
  /** A course's parts/modules (Task K2) — `[]` for every flat, pre-K2 course. */
  chapters?: AdminChapter[];
  isDraft: boolean;
  /**
   * The course's optional-translation setting (Task: lesson-language) —
   * threaded down to `LessonEditPanel` so a monolingual course's lessons show
   * ONE title/desc/notes input instead of forced ht+fr pairs (see that
   * component's doc comment). Defaults to `true`/`'ht'` (a fully bilingual
   * course, same behaviour as every course before this task) so a call site
   * that hasn't been updated yet still renders the pre-existing paired UI —
   * plain data props, NOT part of the `actions` DI contract below.
   */
  bilingual?: boolean;
  primaryLocale?: 'ht' | 'fr';
  /**
   * Server-known "is the document upload rail configured?" (Stage 4,
   * `bunnyStorageConfigured()`) — threaded down to `LessonEditPanel`'s
   * `ResourcesEditor` dropzone, same plain-data-prop route as `bilingual`.
   * Additive with a `true` default (an un-updated call site keeps the
   * dropzone, and a runtime `not_configured` answer still degrades calmly).
   */
  uploadEnabled?: boolean;
  /** REQUIRED — injected by the teacher studio (Task C3-T4 / K2). No
   *  default: authoring lives only in the studio now (Stage 1), so there is
   *  no admin fallback to reach for. */
  actions: LessonActions;
}) {
  const t = useTranslations('admin.cms.lessons');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /**
   * Review fix — the plan's saves must FAIL VISIBLY, not silently: every
   * lesson commit routed through here (title blur, mm:ss blur, preview
   * toggle, the video-guid commit after an upload) used to produce nothing
   * at all on failure. A failed action now raises the red line rendered
   * under the section heading below, and `act` RESOLVES with the result so
   * a caller that needs its own, closer-to-the-field surface (the video
   * save in `LessonEditPanel` → `VideoUpload`) can await it.
   */
  const [actionError, setActionError] = useState(false);
  const act = (fn: () => Promise<{ ok: boolean }>): Promise<{ ok: boolean }> =>
    new Promise((resolve) =>
      start(async () => {
        const r = await fn();
        setActionError(!r.ok);
        if (r.ok) router.refresh();
        resolve(r);
      }),
    );
  const toggleExpand = (lessonId: string) => setExpandedId((cur) => (cur === lessonId ? null : lessonId));

  /**
   * Stage 5 — progress that survives navigation within the plan. LIFTED
   * per-lesson upload state (no global store, no context provider): each
   * `VideoUpload` reports its phase up (`onUploadPhase`, threaded down as a
   * plain callback prop), and any lesson present in this map keeps its edit
   * panel MOUNTED when its accordion row collapses (`LessonRow` hides it
   * with `display:none` instead of unmounting) — so the in-flight XHR and
   * its retry/resume state live on, and the collapsed row can show the slim
   * "Ap voye… X%" strip. 'idle'/'done' clear the entry; 'error' keeps it,
   * because the panel's resume-from-last-offset context must not be thrown
   * away by a collapse. The identical-state bailout matters: progress
   * events fire per integer percent, and returning `prev` unchanged lets
   * React skip re-rendering the whole plan for repeats.
   */
  const [uploads, setUploads] = useState<Record<string, LessonUploadInfo>>({});
  const onUploadPhase = (lessonId: string, phase: VideoUploadPhase, pct: number) =>
    setUploads((prev) => {
      if (phase === 'creating' || phase === 'uploading' || phase === 'error') {
        const cur = prev[lessonId];
        const nextPct = phase === 'uploading' ? pct : cur?.pct ?? 0;
        if (cur && cur.phase === phase && cur.pct === nextPct) return prev;
        return { ...prev, [lessonId]: { phase, pct: nextPct } };
      }
      if (!(lessonId in prev)) return prev;
      const next = { ...prev };
      delete next[lessonId];
      return next;
    });

  /**
   * Review fix — while any video upload is actually in flight ('creating' /
   * 'uploading'; a settled 'error' can wait), two guards make the dropzone's
   * "ou ka kontinye travay" promise survive navigation OUT of the plan too:
   *  - `beginUploadActivity()` registers with the module-level tally that
   *    `MobileStepBar`/`ControlRail`/`QuickActions` consult before a `?tab=`
   *    push (which unmounts this whole component, upload included);
   *  - a `beforeunload` listener makes the browser confirm hard navigations
   *    (reload, tab close, external link) the router never sees.
   */
  const uploadBusy = Object.values(uploads).some((u) => u.phase === 'creating' || u.phase === 'uploading');
  useEffect(() => {
    if (!uploadBusy) return;
    beginUploadActivity();
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      endUploadActivity();
      window.removeEventListener('beforeunload', warn);
    };
  }, [uploadBusy]);

  /**
   * The studio bon-de-contrôle rail's jump-to-field (Task D1 — le
   * bordereau): a checklist row for a per-lesson gap (missing video, missing
   * title, no preview lesson yet) points at `#lesson-<id>` — but that
   * lesson's actual fields only exist once its accordion row is expanded.
   * Two triggers open it here: (1) arriving on THIS step already carrying
   * the hash (a cross-step click navigated via `router.push(...#lesson-x)`,
   * so this component mounts fresh with the hash already in the URL), and
   * (2) a live `studio:jump-lesson` event (a same-step click — no
   * navigation, so nothing remounts this component to re-read the hash).
   * Either way this only ever sets local accordion state; the actual
   * scroll+focus is `components/teacher/studio/jump.ts`'s job, called by
   * the rail itself once the row (and, after this effect, its fields) exist.
   */
  useEffect(() => {
    function expandFor(anchorId: string | null) {
      // `lesson-<id>` plus the Stage 1 sub-anchors `lesson-<id>-video` /
      // `lesson-<id>-resources` (LessonEditPanel's sections) all expand the
      // same row — strip the known suffix first (lesson ids are uuids, they
      // can't themselves end in "-video"/"-resources").
      const id = anchorId?.replace(/-(?:video|resources)$/, '').match(/^lesson-(.+)$/)?.[1];
      if (id && lessons.some((l) => l.id === id)) setExpandedId(id);
    }
    expandFor(typeof window !== 'undefined' ? window.location.hash.slice(1) : null);
    function onJump(e: Event) {
      expandFor((e as CustomEvent<{ anchorId?: string }>).detail?.anchorId ?? null);
    }
    window.addEventListener('studio:jump-lesson', onJump);
    return () => window.removeEventListener('studio:jump-lesson', onJump);
  }, [lessons]);

  const chaptersSorted = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder);
  const byChapter = new Map<string, AdminLesson[]>();
  for (const l of lessons) {
    if (!l.chapterId) continue;
    const arr = byChapter.get(l.chapterId) ?? [];
    arr.push(l);
    byChapter.set(l.chapterId, arr);
  }
  const ungrouped = lessons.filter((l) => !l.chapterId);
  const isEmpty = chaptersSorted.length === 0 && lessons.length === 0;

  // The single "Ajoute yon leson" control (Task D2 #2 — empty states become
  // invitations): SAME id, SAME action wiring either way — only its home
  // (inside the big invitation block vs the small action row below) and its
  // styling change depending on `isEmpty`, so the D1 bon-de-contrôle anchor
  // (`plan-add-lesson`, see readiness-anchors.ts) always resolves to exactly
  // one focusable element.
  const addLessonButton = (
    // ONE prominent style whether the plan is empty or not (owner:
    // « terrible UX » — the non-empty variant used to be a tiny underlined
    // text link, invisible exactly when a teacher is mid-flow adding
    // lesson after lesson). A real button, always.
    <button
      id="plan-add-lesson"
      type="button"
      onClick={() => act(() => actions.addLesson(slug))}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-teal/40 bg-teal/10 px-4 py-2.5 font-mono text-[12px] font-semibold text-teal transition-colors hover:bg-teal/15',
        focusRing,
      )}
    >
      <IconPlus size={15} /> {t('add')}
    </button>
  );

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('title')} · {lessons.length}</h2>
        {pending && <IconLoader2 size={14} className="animate-spin text-ink/40" />}
      </div>

      {/* Review fix — a failed save is SAID, in plain language (same visual
          as ImagesManager's error line), instead of vanishing silently. */}
      {actionError && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-stampred/30 bg-stampred/5 px-3 py-2 font-mono text-[11px] text-stampred" role="alert">
          <IconAlertTriangle size={13} className="shrink-0" /> {t('actionError')}
        </p>
      )}

      {isEmpty ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink/20 bg-paper px-4 py-8 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-ochre/10 text-ochre" aria-hidden>
            <IconBooks size={22} />
          </span>
          <p className="font-display text-base font-bold leading-tight text-ink">{t('emptyLessonsTitle')}</p>
          <p className="max-w-xs text-[12px] leading-snug text-graphite/60">{t('emptyLessonsLine')}</p>
          {addLessonButton}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {chaptersSorted.map((chapter, i) => (
            <ChapterGroup
              key={chapter.id}
              slug={slug}
              chapter={chapter}
              index={i}
              total={chaptersSorted.length}
              lessons={byChapter.get(chapter.id) ?? []}
              chapters={chaptersSorted}
              isDraft={isDraft}
              onAct={act}
              actions={actions}
              bilingual={bilingual}
              primaryLocale={primaryLocale}
              uploadEnabled={uploadEnabled}
              expandedId={expandedId}
              onToggleExpand={toggleExpand}
              uploads={uploads}
              onUploadPhase={onUploadPhase}
            />
          ))}

          <div className={chaptersSorted.length > 0 ? 'rounded-lg border border-dashed border-ink/15 p-3' : undefined}>
            {chaptersSorted.length > 0 && (
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-ink/45">{t('ungrouped')}</h3>
            )}
            {ungrouped.length === 0 ? (
              chaptersSorted.length > 0 && <p className="font-mono text-[11px] text-graphite/45">{t('empty')}</p>
            ) : (
              <ul className="space-y-2">
                {ungrouped.map((l, i) => (
                  <LessonRow
                    key={l.id}
                    slug={slug}
                    lesson={l}
                    index={i}
                    total={ungrouped.length}
                    isDraft={isDraft}
                    onAct={act}
                    actions={actions}
                    chapters={chaptersSorted}
                    bilingual={bilingual}
                    primaryLocale={primaryLocale}
                    uploadEnabled={uploadEnabled}
                    expandedId={expandedId}
                    onToggleExpand={toggleExpand}
                    uploadInfo={uploads[l.id]}
                    onUploadPhase={onUploadPhase}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {/* `id` (on `addLessonButton`, defined above) is the studio
            bon-de-contrôle rail's jump target for `hasLesson` and every
            per-lesson gap on a lesson-less course (Task D1) — hidden here
            when `isEmpty` because the SAME button already lives in the
            invitation block above. */}
        {!isEmpty && addLessonButton}
        <button
          type="button"
          onClick={() => act(() => actions.createChapter(slug, { title_ht: '', title_fr: '' }))}
          className={cn('inline-flex items-center gap-1 font-mono text-[11px] text-ochre hover:underline', focusRing)}
        >
          <IconPlus size={13} /> {t('addChapter')}
        </button>
        {/* Chapters group lessons but stay optional (Task D2 #2 — "no
            chapters" gets an explanation, not silence). */}
        {chaptersSorted.length === 0 && (
          <span className="flex items-center gap-1 font-mono text-[10px] leading-snug text-ink/45">
            <IconInfoCircle size={12} className="shrink-0" aria-hidden /> {t('emptyChaptersNote')}
          </span>
        )}
      </div>
    </section>
  );
}
