import Image, { type ImageProps } from 'next/image';

/**
 * next/image wrapper that decides `unoptimized` per source so every image
 * source the app can hold renders without ever crashing a page:
 *  - local SVGs (brand placeholders) — the optimizer rejects them;
 *  - remote URLs on any host OTHER than Bunny's CDN (`*.b-cdn.net`) — a
 *    teacher can paste an arbitrary image link in the editor's "Avanse"
 *    path, and next/image THROWS at render time for a host missing from
 *    `images.remotePatterns` (next.config.mjs whitelists only the Bunny
 *    CDN). Serving those unoptimized (a plain passthrough) degrades
 *    gracefully instead of 500ing a public sales page.
 * Local rasters and Bunny CDN uploads (the Stage 3 photo-upload rail — the
 * overwhelmingly common real case) stay fully optimised.
 */
function isBunnyCdnUrl(src: string): boolean {
  try {
    return new URL(src).hostname.toLowerCase().endsWith('.b-cdn.net');
  } catch {
    return false;
  }
}

export function SmartImage(props: ImageProps) {
  const src = typeof props.src === 'string' ? props.src : '';
  const isSvg = src.toLowerCase().split(/[?#]/)[0].endsWith('.svg');
  const isRemote = /^https?:\/\//i.test(src);
  const unoptimized = props.unoptimized ?? (isSvg || (isRemote && !isBunnyCdnUrl(src)));
  return <Image {...props} unoptimized={unoptimized} />;
}
