import { IconClock } from '@tabler/icons-react';
import { Reveal } from '@/components/ui/Reveal';
import { LessonPreviewButton } from '@/components/courses/LessonPreview';

export type ManifestRow = {
  title: string;
  desc?: string;
  /** Pre-formatted, e.g. "12 min". */
  duration?: string;
  /** Marks the row as a free preview — only rendered when `previewLabel` is also given. */
  preview?: boolean;
  /**
   * Overrides the row's displayed number (defaults to its 1-based position
   * in `rows`). Task K3: lets a caller show a lesson's real position in the
   * course's full curriculum when `rows` is only one chapter's slice of it.
   */
  number?: number;
  /**
   * Stage 4 — watchable previews: a ready Bunny embed URL for a `preview`
   * row. When present (the server only supplies it for `is_preview` lessons
   * with a video, and only when Bunny is configured — lib/bunny/embed.ts
   * returns `null` otherwise) AND `watchLabel`/`closeLabel` are given, the
   * row grows a « Gade apèsi gratis » button opening the preview modal.
   * Absent ⇒ the row renders exactly as before.
   */
  previewEmbedUrl?: string | null;
};

/**
 * The cargo-manifest view of a course's lesson list: each lesson is one
 * numbered row (ochre display number, like the catalogue/home manifests),
 * with its duration and description as document data. Presentational only —
 * labels are passed in already localized so it stays reusable wherever a
 * lesson sequence needs the manifest treatment.
 */
export function ManifestList({
  rows,
  previewLabel,
  watchLabel,
  closeLabel,
}: {
  rows: ManifestRow[];
  previewLabel?: string;
  /** Localized « Gade apèsi gratis » — required for the preview button to render. */
  watchLabel?: string;
  /** Localized close label for the preview modal — required alongside `watchLabel`. */
  closeLabel?: string;
}) {
  return (
    <ol className="border-y border-ink/10">
      {rows.map((row, i) => (
        <li key={i} className="border-b border-ink/10 last:border-b-0">
          <Reveal delay={Math.min(i, 8) * 45}>
            <div className="flex gap-4 py-5">
              <span className="font-display text-2xl font-black leading-none text-ochre tabular-nums">
                {String(row.number ?? i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
                    {row.title}
                    {row.preview && previewLabel && (
                      <span className="rounded bg-teal/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-teal">
                        {previewLabel}
                      </span>
                    )}
                  </h3>
                  {row.duration && (
                    <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-graphite/55">
                      <IconClock size={13} />
                      {row.duration}
                    </span>
                  )}
                </div>
                {row.desc && (
                  <p className="mt-1 text-sm leading-relaxed text-graphite/80">
                    {row.desc}
                  </p>
                )}
                {row.preview && row.previewEmbedUrl && watchLabel && closeLabel && (
                  <LessonPreviewButton
                    title={row.title}
                    embedUrl={row.previewEmbedUrl}
                    openLabel={watchLabel}
                    closeLabel={closeLabel}
                  />
                )}
              </div>
            </div>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}
