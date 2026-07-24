'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { captureUtmAction } from '@/lib/site-actions-public';

const CAPTURED_KEY = 'pnice_utm_first_touch';
const SENT_KEY = 'pnice_utm_sent';

/**
 * Real first-touch UTM capture (Task L5). Mounted once, gated on
 * `clerkEnabled`, in app/[locale]/(site)/layout.tsx — the public + learner
 * surface, which is exactly where a campaign landing page and the
 * subsequent sign-up both live. Renders nothing.
 *
 * Deliberately reads `window.location.search` directly in an effect instead
 * of next/navigation's `useSearchParams()` — that hook requires wrapping an
 * ancestor in <Suspense> (see the comment in
 * app/[locale]/(site)/formations/page.tsx) to avoid deopting the route; a
 * plain browser API read after mount needs no such boundary and is just as
 * reliable for a value that's only ever read once per session.
 *
 * Two independent effects:
 *  1) On every page load, if the URL carries any of
 *     utm_source/utm_medium/utm_campaign AND nothing has been captured yet
 *     THIS SESSION, stash it in sessionStorage. A later page in the same
 *     session with no UTM params must never overwrite an earlier campaign
 *     landing — that's what "first touch" means client-side.
 *  2) Once Clerk reports a signed-in user, if a stash exists and hasn't been
 *     sent yet, fire `captureUtmAction` once. The server action is the REAL
 *     first-touch guard (`onConflictDoNothing` on `user_acquisition.userId`
 *     — see lib/site-actions-public.ts); this sessionStorage flag only saves
 *     a redundant network call on every navigation within the same tab.
 *
 * Safe with Clerk disabled (this component is never mounted at all — see
 * the (site) layout) and safe with no DATABASE_URL (captureUtmAction itself
 * no-ops) — never throws, never blocks render.
 */
export function UtmCapture() {
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(CAPTURED_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const source = params.get('utm_source');
    const medium = params.get('utm_medium');
    const campaign = params.get('utm_campaign');
    if (source || medium || campaign) {
      sessionStorage.setItem(CAPTURED_KEY, JSON.stringify({ source, medium, campaign }));
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SENT_KEY)) return;
    const raw = sessionStorage.getItem(CAPTURED_KEY);
    if (!raw) return;
    // Set the guard BEFORE the async call — a slow/failed request must never
    // cause a retry storm on the next render/navigation.
    sessionStorage.setItem(SENT_KEY, '1');
    try {
      const utm = JSON.parse(raw) as { source: string | null; medium: string | null; campaign: string | null };
      void captureUtmAction(utm).catch(() => {});
    } catch {
      // Malformed stash — ignore, nothing to send.
    }
  }, [isLoaded, isSignedIn]);

  return null;
}
