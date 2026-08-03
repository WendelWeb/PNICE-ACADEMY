/**
 * Module-level tally of IN-FLIGHT uploads (review fix — "progress that
 * survives navigation" must not be silently killed by navigation the UI
 * itself invites). The editor page renders the active step's content
 * conditionally (`activeTab === 'plan' && <LessonsManager/>`), so a `?tab=`
 * push from `MobileStepBar`/`ControlRail`/`QuickActions` UNMOUNTS
 * `PlanEditor` — and with it every in-flight video upload, its progress UI
 * and its resume context — with zero warning, while the dropzone copy
 * promises "ou ka kontinye travay pandan l ap monte".
 *
 * `PlanEditor` registers here while any lesson upload is 'creating' or
 * 'uploading' (it also adds a `beforeunload` guard for hard navigations);
 * the step-navigation components consult `hasActiveUploads()` and ask the
 * teacher to confirm before swapping the plan out of the tree.
 *
 * A plain module singleton, not React state/context: the check happens
 * inside click handlers (no re-render needed when it changes), and the
 * producers/consumers live in different component trees that share nothing
 * but this bundle. Counter-based so several editors/uploads coexist safely;
 * SSR-safe because it is only ever touched from effects and event handlers.
 */
let activeUploads = 0;

/** Called by an upload owner (e.g. `PlanEditor`) when uploads start being in flight. */
export function beginUploadActivity(): void {
  activeUploads += 1;
}

/** Balances one `beginUploadActivity` call — floor at zero, never negative. */
export function endUploadActivity(): void {
  activeUploads = Math.max(0, activeUploads - 1);
}

/** `true` while anything is still uploading — navigation should confirm first. */
export function hasActiveUploads(): boolean {
  return activeUploads > 0;
}
