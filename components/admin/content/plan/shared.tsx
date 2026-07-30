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

/** A labelled sub-block inside the expanded lesson panel (Task A2 #4 —
 *  "Titres" / "Description" / "Vidéo" / "Notes pour l'élève" / "Ressources"). */
export function EditPanelSection({
  title,
  extra,
  children,
}: {
  title: React.ReactNode;
  /** Optional right-aligned control in the section's header row (e.g. the
   *  "move to chapter" select next to "Titres"). */
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-ink/10 bg-paper-light/70 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
        <h4 className="font-mono text-[10px] uppercase tracking-wide text-ink/50">{title}</h4>
        {extra}
      </div>
      {children}
    </div>
  );
}
