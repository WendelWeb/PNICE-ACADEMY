import type { MetadataRoute } from 'next';

/**
 * Web app manifest (Stage 8 — launch hygiene). One manifest for the whole
 * site (this file convention can't be per-locale) — Kreyòl first, matching
 * the brand's default-locale voice everywhere else (`home.meta` in
 * messages/ht.json says the same thing on the homepage itself).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PNICE Academy',
    short_name: 'PNICE',
    description: 'Mache ayisyen pou konesans pratik — achte yon fòmasyon apa oswa pran yon pass.',
    start_url: '/ht',
    lang: 'ht',
    display: 'standalone',
    background_color: '#EDE6D6',
    theme_color: '#10204A',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
