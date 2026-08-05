/**
 * True root layout (Stage 8 — launch hygiene). This project's REAL html/body
 * lives in app/[locale]/layout.tsx — every actual route is locale-prefixed
 * (localePrefix: 'always', i18n/routing.ts), so that's where <html lang>,
 * fonts, and providers belong. This file exists only because Next's App
 * Router requires a root layout to exist for any file rendered directly
 * under app/ outside a dynamic segment (app/not-found.tsx — the non-locale
 * 404 catch-all next-intl's own docs call for) — a plain passthrough here,
 * never rendered for a normal /ht or /fr request.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
