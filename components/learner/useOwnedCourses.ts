'use client';

import { useEffect, useState } from 'react';

/**
 * The signed-in visitor's accessible course slugs, fetched ONCE per page
 * load and shared by every card on the page (module-level promise cache —
 * eight cards must not mean eight requests).
 *
 * Returns `null` until known, then a Set (empty for signed-out visitors or
 * on any failure). Callers render their normal, server-painted state while
 * `null` — ownership is an ENHANCEMENT layered over the cached page, never
 * a gate: the worst failure mode is the default buy button, which the
 * checkout's own repurchase guard already backstops.
 */
let cached: Promise<Set<string>> | null = null;

function load(): Promise<Set<string>> {
  if (!cached) {
    cached = fetch('/api/me/courses')
      .then((r) => (r.ok ? r.json() : { slugs: [] }))
      .then((d: { slugs?: unknown }) =>
        new Set(Array.isArray(d.slugs) ? d.slugs.filter((s): s is string => typeof s === 'string') : []),
      )
      .catch(() => new Set<string>());
  }
  return cached;
}

export function useOwnedCourses(): Set<string> | null {
  const [owned, setOwned] = useState<Set<string> | null>(null);
  useEffect(() => {
    let on = true;
    load().then((s) => {
      if (on) setOwned(s);
    });
    return () => {
      on = false;
    };
  }, []);
  return owned;
}
