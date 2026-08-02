/**
 * The active step's heading in the bordereau's main column (Task D1 — le
 * bordereau): a bordered number circle + the step's title + its one-line
 * intent ("Ce que l'élève voit en premier", etc.) — the SAME numbering
 * device `/enseigner`'s own "4 real stations" section uses (a real build
 * sequence justifies the numbering here, same rule). Purely presentational,
 * no state/i18n of its own — the page resolves the translated strings via
 * `teach.studio.editor.steps.<key>.{title,intent}` and passes them in,
 * matching `ControlRail`'s own step labels.
 */
export function EditorStepHeading({
  number,
  title,
  intent,
}: {
  number: number;
  title: string;
  intent: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ochre font-mono text-sm font-semibold text-ochre"
      >
        {String(number).padStart(2, '0')}
      </span>
      <div className="min-w-0 pt-1">
        <h2 className="font-display text-xl font-bold leading-tight text-ink">{title}</h2>
        <p className="mt-0.5 text-[13px] leading-snug text-graphite/60">{intent}</p>
      </div>
    </div>
  );
}
