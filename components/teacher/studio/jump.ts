/**
 * components/teacher/studio/jump.ts — the "click a bon-de-contrôle row →
 * land on the actual field" mechanic (Task D1 — le bordereau). Browser-only
 * (`window`/`document`), used exclusively from client components
 * (`ControlRail`), never imported by a server component.
 *
 * `jumpToAnchor` is a small retry loop rather than a single
 * `document.getElementById` call because the target isn't always mounted
 * yet the instant it's called: a cross-step click first triggers a
 * `router.push` (a new server render swapping in the target step's panel,
 * one or more frames later) and, for a lesson row, `PlanEditor` may still be
 * expanding the right lesson (see its own hash/`studio:jump-lesson` listener)
 * before that lesson's real inputs exist in the DOM. Polling via
 * `requestAnimationFrame` — rather than a fixed `setTimeout` — means it
 * resolves the instant the content is ready on a fast render and still
 * succeeds on a slow one, capped at ~90 frames (~1.5s at 60fps) so a
 * genuinely missing id gives up instead of polling forever. (Raised from 40:
 * on a slow connection the cross-step server render alone could eat the
 * whole ~660ms budget and the jump silently gave up.)
 */

const MAX_ATTEMPTS = 90;

/** Same dual check the CSS motion grammar uses (see globals.css's
 *  `.stamp`/`.reveal` reduced-motion rules): the OS-level media query OR the
 *  app's own user-level "reduce motion" preference (`PreferenceApplier.tsx`
 *  stamps `data-reduce-motion` on `<html>`). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const appPref = document.documentElement.dataset.reduceMotion === 'true';
  return media || appPref;
}

function isEmptyValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  if (el instanceof HTMLSelectElement) return false;
  return el.value.trim() === '';
}

/** `offsetParent === null` is true for anything `display:none`d (a collapsed
 *  `<details>` body, the `hidden` file input) — focusing those either does
 *  nothing or scrolls to a blank spot. None of our jump targets are
 *  `position: fixed` (the other case where offsetParent is null), so this
 *  cheap check is safe here. */
function isVisible(el: HTMLElement): boolean {
  return el.offsetParent !== null;
}

/** Prefers an EMPTY input/textarea/select inside the container (that's the
 *  thing to actually fix); falls back to the first one, then to any other
 *  focusable element (e.g. a collapsed lesson row's expand button, when its
 *  fields aren't mounted yet), then to the container itself. Skips anything
 *  invisible and every `input[type=file]` (the dropzone's hidden picker —
 *  its value is always "" so it used to win the "first empty field" race
 *  and swallow the focus). */
function pickFocusTarget(container: HTMLElement): HTMLElement | null {
  const fields = Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'),
  ).filter(
    (el) => !el.disabled && !(el instanceof HTMLInputElement && el.type === 'file') && isVisible(el),
  );
  const empty = fields.find(isEmptyValue);
  if (empty) return empty;
  if (fields.length > 0) return fields[0];

  const focusable = Array.from(container.querySelectorAll<HTMLElement>('button, a[href], [tabindex]')).find(isVisible);
  if (focusable) return focusable;

  return container.matches('[tabindex]') ? container : null;
}

/**
 * Scrolls the element with `id === anchorId` into view and focuses the most
 * relevant field inside it. Respects `prefers-reduced-motion` (instant jump,
 * no smooth scroll — see the CONSTRAINTS in the D1 plan). Safe to call
 * immediately after a `router.push` to a different step: it waits for the
 * new panel (and, for lesson rows, the expanded field inside it) to appear.
 */
export function jumpToAnchor(anchorId: string, attempt = 0): void {
  if (typeof document === 'undefined') return;

  const container = document.getElementById(anchorId);
  if (!container) {
    if (attempt < MAX_ATTEMPTS) requestAnimationFrame(() => jumpToAnchor(anchorId, attempt + 1));
    return;
  }

  const target = pickFocusTarget(container);
  // Container exists but nothing focusable inside it yet (a lesson row still
  // expanding) — keep polling a little longer before settling for whatever
  // we've got.
  if (!target && attempt < MAX_ATTEMPTS) {
    requestAnimationFrame(() => jumpToAnchor(anchorId, attempt + 1));
    return;
  }

  const el = target ?? container;
  const reduce = prefersReducedMotion();
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
}
