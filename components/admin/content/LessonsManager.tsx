'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconPlus,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconLoader2,
  IconAlertTriangle,
  IconVideo,
  IconVideoOff,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import {
  addLessonAction,
  updateLessonAction,
  deleteLessonAction,
  moveLessonAction,
  validateBunnyVideoAction,
  createVideoUploadAction,
} from '@/lib/admin/content-actions';
import type { AdminLesson, LessonPatch } from '@/lib/courses/write';
import type { BunnyUploadResult } from '@/lib/bunny/upload';
import { VideoUpload } from '@/components/content/VideoUpload';
import { inputCls } from './fields';

type ContentResult = { ok: boolean; message?: string; slug?: string; count?: number };

/** Same shape as `lib/admin/content-actions.ts`'s 6 lesson actions — the
 *  studio (Task C3-T4) injects its own owner-scoped versions here instead. */
export type LessonActions = {
  addLesson: (slug: string) => Promise<ContentResult>;
  updateLesson: (slug: string, lessonId: string, patch: LessonPatch) => Promise<ContentResult>;
  deleteLesson: (slug: string, lessonId: string) => Promise<ContentResult>;
  moveLesson: (slug: string, lessonId: string, dir: 'up' | 'down') => Promise<ContentResult>;
  validateBunnyVideo: (videoId: string) => Promise<ContentResult>;
  /** Autonomous upload (Task: video upload): creates the Bunny video object
   *  + TUS upload authorization for this lesson. Studio/admin each inject
   *  their own ownership/capability-gated version (createMyVideoUploadAction
   *  / createVideoUploadAction) — see components/content/VideoUpload.tsx. */
  createUpload: (slug: string, lessonId: string, title: string) => Promise<BunnyUploadResult>;
};

const defaultLessonActions: LessonActions = {
  addLesson: addLessonAction,
  updateLesson: updateLessonAction,
  deleteLesson: deleteLessonAction,
  moveLesson: moveLessonAction,
  validateBunnyVideo: validateBunnyVideoAction,
  createUpload: createVideoUploadAction,
};

function secToMmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
function mmssToSec(v: string): number {
  const [m, s] = v.split(':').map((x) => Number(x) || 0);
  return v.includes(':') ? m * 60 + (s || 0) : (Number(v) || 0);
}

export function LessonsManager({
  slug,
  lessons,
  isDraft,
  actions = defaultLessonActions,
}: {
  slug: string;
  lessons: AdminLesson[];
  isDraft: boolean;
  /** Injected by the teacher studio (Task C3-T4); defaults to the admin CMS
   *  actions so every existing `/admin/cours/[slug]/editer` call site is
   *  unchanged. */
  actions?: LessonActions;
}) {
  const t = useTranslations('admin.cms.lessons');
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean }>) => start(async () => { if ((await fn()).ok) router.refresh(); });

  return (
    <section className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-wide text-ink/55">{t('title')} · {lessons.length}</h2>
        {pending && <IconLoader2 size={14} className="animate-spin text-ink/40" />}
      </div>

      {lessons.length === 0 ? (
        <p className="mt-3 font-mono text-xs text-graphite/55">{t('empty')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {lessons.map((l, i) => (
            <LessonRow key={l.id} slug={slug} lesson={l} index={i} total={lessons.length} isDraft={isDraft} onAct={act} actions={actions} />
          ))}
        </ul>
      )}

      <button type="button" onClick={() => act(() => actions.addLesson(slug))} className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline">
        <IconPlus size={13} /> {t('add')}
      </button>
    </section>
  );
}

function LessonRow({
  slug,
  lesson,
  index,
  total,
  isDraft,
  onAct,
  actions,
}: {
  slug: string;
  lesson: AdminLesson;
  index: number;
  total: number;
  isDraft: boolean;
  onAct: (fn: () => Promise<{ ok: boolean }>) => void;
  actions: LessonActions;
}) {
  const t = useTranslations('admin.cms.lessons');
  const [titleHt, setTitleHt] = useState(lesson.title_ht);
  const [titleFr, setTitleFr] = useState(lesson.title_fr);
  const [descHt, setDescHt] = useState(lesson.desc_ht);
  const [descFr, setDescFr] = useState(lesson.desc_fr);
  const [video, setVideo] = useState(lesson.bunnyVideoId);
  const [dur, setDur] = useState(secToMmss(lesson.durationSeconds));
  const [bunny, setBunny] = useState<string | null>(null);
  const [vp, vStart] = useTransition();

  const noVideo = !lesson.bunnyVideoId;
  const iconBtn = 'grid h-6 w-6 place-items-center rounded border border-ink/15 text-ink/55 hover:bg-ink/[0.04] disabled:opacity-30';

  const commit = (patch: LessonPatch) => onAct(() => actions.updateLesson(slug, lesson.id, patch));

  return (
    <li className={cn('rounded-lg border bg-paper p-2.5', noVideo && !isDraft ? 'border-stampred/40' : 'border-ink/10')}>
      <div className="flex items-start gap-2">
        <span className="mt-1 font-mono text-[10px] text-ink/40">{index + 1}</span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input value={titleHt} onChange={(e) => setTitleHt(e.target.value)} onBlur={() => titleHt !== lesson.title_ht && commit({ title_ht: titleHt })} placeholder={t('titleHt')} className={inputCls} />
            <input value={titleFr} onChange={(e) => setTitleFr(e.target.value)} onBlur={() => titleFr !== lesson.title_fr && commit({ title_fr: titleFr })} placeholder={t('titleFr')} className={inputCls} />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <textarea value={descHt} onChange={(e) => setDescHt(e.target.value)} onBlur={() => descHt !== lesson.desc_ht && commit({ desc_ht: descHt })} placeholder={t('descHt')} className={cn(inputCls, 'min-h-[44px] resize-y')} />
            <textarea value={descFr} onChange={(e) => setDescFr(e.target.value)} onBlur={() => descFr !== lesson.desc_fr && commit({ desc_fr: descFr })} placeholder={t('descFr')} className={cn(inputCls, 'min-h-[44px] resize-y')} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1">
              {noVideo ? <IconVideoOff size={13} className="text-stampred" /> : <IconVideo size={13} className="text-teal" />}
              <input value={video} onChange={(e) => setVideo(e.target.value)} onBlur={() => video !== lesson.bunnyVideoId && commit({ bunnyVideoId: video })} placeholder={t('bunnyId')} className={cn(inputCls, 'w-44')} />
            </span>
            <button
              type="button"
              disabled={vp}
              onClick={() => vStart(async () => { const r = await actions.validateBunnyVideo(video); setBunny(r.ok ? (r.message === 'unvalidated_mock' ? t('bunnyMock') : t('bunnyOk')) : t('bunnyBad')); })}
              className="rounded border border-ink/15 px-2 py-1 font-mono text-[10px] text-ink/60 hover:bg-ink/[0.04]"
            >
              {vp ? <IconLoader2 size={11} className="animate-spin" /> : t('validate')}
            </button>
            {bunny && <span className="font-mono text-[10px] text-ink/55">{bunny}</span>}
            <VideoUpload
              lessonTitle={titleHt || titleFr || lesson.title_ht || lesson.title_fr}
              createUpload={(title) => actions.createUpload(slug, lesson.id, title)}
              onUploaded={(guid) => {
                setVideo(guid);
                onAct(() => actions.updateLesson(slug, lesson.id, { bunnyVideoId: guid }));
              }}
            />
            <input value={dur} onChange={(e) => setDur(e.target.value)} onBlur={() => commit({ durationSeconds: mmssToSec(dur) })} placeholder="mm:ss" className={cn(inputCls, 'w-16 text-center')} />
            <label className="flex items-center gap-1 font-mono text-[10px] text-ink/60">
              <input type="checkbox" checked={lesson.isPreview} onChange={(e) => commit({ isPreview: e.target.checked })} className="h-3.5 w-3.5 accent-ochre" />
              {t('preview')}
            </label>
          </div>
          {noVideo && !isDraft && (
            <p className="flex items-center gap-1 font-mono text-[10px] text-stampred"><IconAlertTriangle size={11} /> {t('noVideoWarn')}</p>
          )}
        </div>
        <span className="flex shrink-0 flex-col gap-0.5">
          <button type="button" onClick={() => onAct(() => actions.moveLesson(slug, lesson.id, 'up'))} disabled={index === 0} className={iconBtn}><IconChevronUp size={12} /></button>
          <button type="button" onClick={() => onAct(() => actions.moveLesson(slug, lesson.id, 'down'))} disabled={index === total - 1} className={iconBtn}><IconChevronDown size={12} /></button>
          <button type="button" onClick={() => onAct(() => actions.deleteLesson(slug, lesson.id))} className={cn(iconBtn, 'text-stampred')}><IconTrash size={12} /></button>
        </span>
      </div>
    </li>
  );
}
