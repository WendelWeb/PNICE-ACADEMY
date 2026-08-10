'use client';

import { useEffect } from 'react';
import './globals.css';
import { logClientErrorAction } from '@/lib/observability/actions';

/**
 * The ROOT error boundary (Stage 8 — launch hygiene) — only fires when
 * app/[locale]/layout.tsx ITSELF throws (not a page/segment below it; those
 * hit app/[locale]/error.tsx instead). Per Next's contract this replaces the
 * ENTIRE document, so it defines its own <html>/<body> and imports
 * globals.css directly (app/[locale]/layout.tsx, the only other place that
 * imports it, is exactly what's being bypassed).
 *
 * No next-intl here on purpose: the locale layout is what failed, so its
 * `NextIntlClientProvider`/message catalog can't be trusted to exist either.
 * Copy is hardcoded, kreyòl first then français — the same "show both,
 * don't guess" honesty as the root app/not-found.tsx (non-locale 404s) for
 * the identical reason: no reliable locale signal at this boundary.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error-boundary]', error);
    // Production hardening pass — real writer for /admin/sante's error-logs
    // panel (previously dead: nothing ever inserted into `error_logs`). Best
    // effort: the action itself never throws, and this call must never block
    // or affect the fallback UI either way.
    void logClientErrorAction({
      message: error.message || 'global-error-boundary',
      route: typeof window !== 'undefined' ? window.location.pathname : 'global-error',
      stack: error.stack,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="ht">
      <body className="antialiased">
        <div
          style={{ background: '#EDE6D6', minHeight: '100vh' }}
          className="grid place-items-center px-4 py-16 text-center"
        >
          <div className="max-w-md">
            <span
              style={{ background: '#D98E2B', color: '#10204A' }}
              className="mx-auto grid h-16 w-16 place-items-center rounded-full text-2xl font-bold"
            >
              PA
            </span>
            <h1 style={{ color: '#10204A' }} className="mt-6 text-2xl font-bold leading-tight">
              Yon bagay pa mache
            </h1>
            <p style={{ color: '#2B2B28' }} className="mt-2 text-[15px] leading-relaxed">
              Gen yon erè grav ki pase. Eseye rechaje paj la.
            </p>
            <h2 style={{ color: '#10204A' }} className="mt-6 text-lg font-bold leading-tight">
              Une erreur est survenue
            </h2>
            <p style={{ color: '#2B2B28' }} className="mt-2 text-[15px] leading-relaxed">
              Un problème grave s&apos;est produit. Essayez de recharger la page.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={reset}
                style={{ background: '#D98E2B', color: '#1b1207' }}
                className="rounded px-6 py-3 text-sm font-semibold"
              >
                Eseye ankò · Réessayer
              </button>
              <a
                href="/ht"
                style={{ borderColor: 'rgba(16,32,74,0.3)', color: '#10204A' }}
                className="rounded border px-6 py-3 text-sm font-semibold"
              >
                Lakay · Accueil
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
