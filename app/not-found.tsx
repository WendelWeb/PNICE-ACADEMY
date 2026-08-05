import './globals.css';

/**
 * TRUE root 404 (Stage 8 — launch hygiene) — for a request that never even
 * enters the `[locale]` segment tree (app/[locale]/not-found.tsx handles
 * every 404 inside it). That only happens for paths middleware's matcher
 * deliberately excludes (`/((?!_next|_vercel|.*\..*).*)` skips anything with
 * a dot, e.g. a stray `/something.php`) — genuinely rare, but real, hence
 * the audit calling it out by name. This file defines its own <html>/<body>
 * (there is no app/layout.tsx at the true root — app/[locale]/layout.tsx is
 * the practical one, and it never wraps this route) and hardcodes bilingual
 * copy for the same reason app/global-error.tsx does: no locale signal
 * exists here to key a translation off of.
 */
export default function RootNotFound() {
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
              Paj sa a pa egziste
            </h1>
            <p style={{ color: '#2B2B28' }} className="mt-2 text-[15px] leading-relaxed">
              Nou pa jwenn paj w ap chèche a.
            </p>
            <h2 style={{ color: '#10204A' }} className="mt-6 text-lg font-bold leading-tight">
              Cette page n&apos;existe pas
            </h2>
            <p style={{ color: '#2B2B28' }} className="mt-2 text-[15px] leading-relaxed">
              Nous n&apos;avons pas trouvé la page que vous cherchez.
            </p>
            <div className="mt-7">
              <a
                href="/ht"
                style={{ background: '#D98E2B', color: '#1b1207' }}
                className="inline-block rounded px-6 py-3 text-sm font-semibold"
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
