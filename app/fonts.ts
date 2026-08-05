import { Big_Shoulders_Display, Work_Sans, IBM_Plex_Mono } from 'next/font/google';

/**
 * Brand fonts via next/font/google (Stage 8 — launch hygiene), replacing the
 * old render-blocking <link> to fonts.googleapis.com in
 * app/[locale]/layout.tsx: next/font self-hosts the files at build time (no
 * third-party request at runtime, no layout shift from a late-arriving
 * stylesheet) and exposes each family as a CSS variable wired into
 * tailwind.config.ts's `fontFamily`.
 *
 * Declared in this shared module (not inline in a layout) so BOTH
 * app/[locale]/layout.tsx and app/global-error.tsx — which renders its own
 * independent <html> when the locale layout itself throws — can apply the
 * exact same fonts; Next dedupes identical next/font/google calls across
 * files at build time, so this costs nothing extra.
 *
 * Weights are the ones actually used today — grepped from every
 * `font-display`/`font-mono`-scoped Tailwind class plus every plain
 * `font-*` weight utility site-wide (Work Sans is the default/inherited
 * body family, so its weights aren't tied to a `font-body` class in most
 * markup): Big Shoulders Display never uses 400 (every heading sets an
 * explicit bold/extrabold/black), Work Sans uses 400–700, and IBM Plex Mono
 * turned out to need 700 too (`font-bold` mono labels existed before this
 * stage but silently browser-synthesized the bold weight — this is a small,
 * welcome side-fix, not a behaviour change to guard against).
 */
export const bigShoulders = Big_Shoulders_Display({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
});

export const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

/** Convenience: every font's CSS-variable class, applied once on <html>. */
export const fontVariables = `${bigShoulders.variable} ${workSans.variable} ${ibmPlexMono.variable}`;
