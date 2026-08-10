'use server';

/**
 * Server action wrapper around `logAppError` for the two CLIENT error
 * boundaries (app/global-error.tsx, app/[locale]/error.tsx) — they run in
 * the browser and can't touch `db` directly, so they call this the same way
 * components/UtmCapture.tsx calls lib/site-actions-public.ts's
 * `captureUtmAction`: a direct import + call from a `useEffect`, no fetch/API
 * route needed. Input is a plain object (React error boundaries hand this a
 * real `Error`, which isn't serializable across the client/server action
 * boundary) — callers extract `message`/`stack` first.
 *
 * Never throws (logAppError itself never throws); this additionally never
 * lets a malformed/oversized payload become the caller's problem.
 */
import { logAppError, type LogAppErrorInput } from './errorLog';

export async function logClientErrorAction(input: LogAppErrorInput): Promise<void> {
  try {
    await logAppError(input);
  } catch {
    // logAppError already never throws — this is an extra belt-and-suspenders
    // guard so a boundary's fire-and-forget call can never itself reject.
  }
}
