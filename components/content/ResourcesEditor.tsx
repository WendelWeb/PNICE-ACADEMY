'use client';

import { useTranslations } from 'next-intl';
import { IconPlus, IconTrash, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { isValidHttpUrl } from '@/lib/teacher/apply-validation';
import type { CourseResource } from '@/db/schema';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light';
const inputCls = 'w-full rounded-lg border border-ink/15 bg-paper px-2.5 py-1.5 text-sm text-ink ' + focusRing;

const KNOWN_ERRORS = [
  'resource_label_ht_required',
  'resource_label_fr_required',
  'resource_label_ht_too_long',
  'resource_label_fr_too_long',
  'resource_kind_invalid',
  'resource_url_invalid',
] as const;

/**
 * A links/downloads editor (Task K2 — plan de cours complet): list of
 * `{ label_ht, label_fr, url, kind }` rows with add/remove. Reused verbatim
 * for BOTH a lesson's `resources` (components/admin/content/LessonsManager.tsx)
 * and a course's `resources` ("liens en description",
 * components/admin/content/CourseEditor.tsx) — same shape
 * (`db/schema.ts`'s `CourseResource`), same validation
 * (`lib/courses/write.ts`'s `validateResource`, mirrored client-side below via
 * `isValidHttpUrl`). Lives in components/content/ (not components/admin/
 * content/) because it's shared by the teacher studio too, same reasoning as
 * `components/content/VideoUpload.tsx`.
 *
 * DUMB/CONTROLLED, like `fields.tsx`'s `PairedList`/`FaqEditor`: every edit
 * calls `onChange` with the next full array immediately — this component
 * never talks to a server action itself. The two callers commit differently
 * (CourseEditor batches into its "Enregistrer" click; LessonsManager commits
 * when focus leaves the whole notes/resources block) — see their own code
 * for that plumbing.
 *
 * `serverError`: the write layer's rejection code (`validateResource`'s
 * return value, e.g. `resource_url_invalid`) surfaced by the caller after a
 * failed save — shown as a single message at the bottom until the next
 * attempt. CLIENT-side, each row's URL is checked live with the same
 * http(s)-only rule (`isValidHttpUrl`) so a teacher sees the problem before
 * ever hitting save.
 */
export function ResourcesEditor({
  resources,
  onChange,
  serverError,
  label,
}: {
  resources: CourseResource[];
  onChange: (next: CourseResource[]) => void;
  serverError?: string | null;
  /** Overrides the default "Resous"/"Ressources" heading — CourseEditor
   *  passes a more contextual "liens en description" label. */
  label?: string;
}) {
  const t = useTranslations('admin.cms.resources');
  const heading = label ?? t('title');

  const setRow = (i: number, patch: Partial<CourseResource>) =>
    onChange(resources.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...resources, { label_ht: '', label_fr: '', url: '', kind: 'link' }]);
  const remove = (i: number) => onChange(resources.filter((_, k) => k !== i));

  const errorText = serverError
    ? t((KNOWN_ERRORS as readonly string[]).includes(serverError) ? `errors.${serverError}` : 'errors.generic')
    : null;

  return (
    <div>
      {/* `label=""` (Task A2 — lesson plan editor's "Ressources" sub-block
          already renders its own heading) deliberately skips this span
          rather than rendering an empty, still-margined line. */}
      {heading && <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-ink/55">{heading}</span>}

      {resources.length === 0 && <p className="font-mono text-[11px] text-graphite/50">{t('empty')}</p>}

      <ul className="space-y-1.5">
        {resources.map((r, i) => {
          const urlOk = r.url.trim() === '' || isValidHttpUrl(r.url);
          return (
            <li key={i} className="space-y-1.5 rounded-lg border border-ink/10 bg-paper p-2">
              <div className="grid gap-1.5 sm:grid-cols-2">
                <input
                  value={r.label_ht}
                  onChange={(e) => setRow(i, { label_ht: e.target.value })}
                  placeholder={t('labelHt')}
                  className={inputCls}
                />
                <input
                  value={r.label_fr}
                  onChange={(e) => setRow(i, { label_fr: e.target.value })}
                  placeholder={t('labelFr')}
                  className={inputCls}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={r.kind}
                  onChange={(e) => setRow(i, { kind: e.target.value as CourseResource['kind'] })}
                  className={cn(inputCls, 'w-28 shrink-0 cursor-pointer')}
                >
                  <option value="link">{t('kindLink')}</option>
                  <option value="file">{t('kindFile')}</option>
                </select>
                <input
                  value={r.url}
                  onChange={(e) => setRow(i, { url: e.target.value })}
                  placeholder={t('urlPlaceholder')}
                  className={cn(inputCls, 'flex-1', !urlOk && 'border-stampred/60')}
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={t('remove')}
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded border border-ink/15 text-stampred hover:bg-ink/[0.04]',
                    focusRing,
                  )}
                >
                  <IconTrash size={13} />
                </button>
              </div>
              {!urlOk && (
                <p className="flex items-center gap-1 font-mono text-[10px] text-stampred">
                  <IconAlertTriangle size={11} /> {t('urlInvalid')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={add}
        className={cn('mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-teal hover:underline', focusRing)}
      >
        <IconPlus size={12} /> {t('add')}
      </button>

      {errorText && (
        <p className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-stampred">
          <IconAlertTriangle size={11} /> {errorText}
        </p>
      )}
    </div>
  );
}
