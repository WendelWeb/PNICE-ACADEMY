/**
 * Decorative "ligne de route" — a subtle dotted vertical thread that runs down
 * the left edge of the content column, the visual through-line of the page.
 * Purely decorative: aria-hidden, hidden on small screens.
 */
export function RouteLine() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
    >
      <div className="mx-auto h-full max-w-page px-6 md:px-8">
        <div className="route-thread ml-[1px] h-full w-px opacity-70" />
      </div>
    </div>
  );
}
