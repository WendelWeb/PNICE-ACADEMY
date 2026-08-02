import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/**
 * Remote hosts next/image may optimise (Stage 3 — course photos): Bunny's
 * CDN wildcard always, plus — when BUNNY_STORAGE_CDN_BASE is set at build
 * time to a CUSTOM (non-b-cdn) hostname — that host too, parsed defensively
 * so a malformed env value can never break the build (the wildcard default
 * simply stands). Any other remote host a teacher pastes by hand is served
 * unoptimized by components/ui/SmartImage.tsx instead of erroring.
 */
function cdnRemotePatterns() {
  const patterns = [{ protocol: 'https', hostname: '**.b-cdn.net' }];
  const base = (process.env.BUNNY_STORAGE_CDN_BASE || '').trim();
  if (base) {
    try {
      const host = new URL(/^https?:\/\//i.test(base) ? base : `https://${base}`).hostname;
      if (host && !host.toLowerCase().endsWith('.b-cdn.net')) {
        patterns.push({ protocol: 'https', hostname: host });
      }
    } catch {
      /* malformed BUNNY_STORAGE_CDN_BASE — keep the safe defaults */
    }
  }
  return patterns;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Allow serving our own local SVG brand placeholders through next/image.
    // Real raster images (jpg/webp) dropped into /public are optimised normally.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'inline',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: cdnRemotePatterns(),
  },
};

export default withNextIntl(nextConfig);
