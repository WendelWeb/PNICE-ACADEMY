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

/**
 * Baseline security headers (Stage 8 — launch hygiene). Deliberately NOT a
 * full Content-Security-Policy: this app embeds Bunny Stream iframes, redirects
 * to Stripe Checkout, and (env-gated) loads Clerk — a real CSP needs a careful,
 * tested allowlist for all three plus next/font's inlined `<style>` and every
 * inline `<script>` this codebase already ships (e.g. the /formations
 * pending-filters guard). Shipping a half-right CSP would silently break one
 * of those instead of adding safety, so it's deferred; these four headers are
 * the safe, unconditional wins that need no allowlist.
 *
 * `X-Frame-Options: SAMEORIGIN` only restricts THIS site being framed by
 * someone else — it says nothing about Bunny's iframe embedded INSIDE this
 * site (that's an outbound frame, unaffected) and nothing about the redirect
 * to checkout.stripe.com (a navigation, not a frame).
 */
function securityHeaders() {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];
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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
};

export default withNextIntl(nextConfig);
