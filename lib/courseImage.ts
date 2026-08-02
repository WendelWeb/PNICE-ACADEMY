import fs from 'node:fs';
import path from 'node:path';

// Server-only. Resolves the image source for a course / site image:
// if the user has dropped a real raster (jpg/webp/png/avif) into /public,
// it is used and optimised; otherwise the branded SVG placeholder is served.

const RASTER_EXTS = ['jpg', 'jpeg', 'webp', 'avif', 'png'];
const MAX_GALLERY_FRAMES = 8;

function resolveRaster(relBase: string): string | null {
  for (const ext of RASTER_EXTS) {
    const abs = path.join(process.cwd(), 'public', `${relBase}.${ext}`);
    try {
      if (fs.existsSync(abs)) return `/${relBase}.${ext}`;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function resolve(relBase: string): string {
  return resolveRaster(relBase) ?? `/${relBase}.svg`;
}

/** code 'PA-01' -> /images/courses/pa-01.(jpg|webp|…|svg) */
export function courseImageSrc(code: string): string {
  return resolve(`images/courses/${code.toLowerCase()}`);
}

/**
 * Gallery for a course card slideshow: the primary image (real raster or SVG
 * placeholder) followed by any extra frames named pa-0X-2, pa-0X-3, … (raster
 * only). Drop more files in to grow the slideshow — no code change needed.
 */
export function courseImages(code: string): string[] {
  const slug = code.toLowerCase();
  const images = [resolve(`images/courses/${slug}`)];
  for (let n = 2; n <= MAX_GALLERY_FRAMES; n++) {
    const extra = resolveRaster(`images/courses/${slug}-${n}`);
    if (extra) images.push(extra);
  }
  return images;
}


/**
 * The DB `courses.images` jsonb shape as this module accepts it (Stage 3 —
 * course photos): permissive on purpose (`null`s, missing urls) so both the
 * public `Course.images` field and the raw DB row type are assignable.
 */
export type CourseImageSet = {
  main?: string | null;
  secondary?: { url?: string | null; alt?: string | null }[] | null;
} | null;

/**
 * Stage 3 — the ONE resolution order every public surface uses:
 *   1. teacher-set DB images (`images.main` first, then `secondary` in order;
 *      a main-less set still shows its secondary photos),
 *   2. the repo-filesystem rasters (`courseImages(code)` — how the 9 static
 *      seeded courses have always resolved),
 *   3. the branded SVG placeholder (inside `courseImages` itself).
 * Static-fallback courses carry no `images`, so they hit 2/3 byte-identically
 * to the pre-Stage-3 behaviour. Blank/whitespace URLs are dropped — a
 * cleared-out main never renders as a broken `src=""`.
 */
export function courseImageList(images: CourseImageSet | undefined, code: string): string[] {
  const main = images?.main?.trim() || '';
  const secondary = (images?.secondary ?? [])
    .map((s) => (s?.url ?? '').trim())
    .filter(Boolean);
  if (main) return [main, ...secondary];
  if (secondary.length > 0) return secondary;
  return courseImages(code);
}

/** First frame of `courseImageList` — the course's single "face" image (cards, checkout, og:image). */
export function courseMainImage(images: CourseImageSet | undefined, code: string): string {
  return courseImageList(images, code)[0];
}

/**
 * Absolute URL for social/WhatsApp previews (og:image MUST be absolute):
 * a DB image is already `https://…` and passes through untouched; a local
 * `/images/…` path is prefixed with the site base. Pure — the caller passes
 * the base (e.g. lib/email/layout.ts's SITE_URL).
 */
export function absoluteImageUrl(src: string, base: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  const cleanBase = base.replace(/\/+$/, '');
  return `${cleanBase}${src.startsWith('/') ? '' : '/'}${src}`;
}

/** name 'hero' -> /images/hero.(jpg|webp|…|svg) */
export function siteImageSrc(name: string): string {
  return resolve(`images/${name}`);
}

/** Gallery for a site image slideshow: name + name-2, name-3, … (raster only). */
export function siteImages(name: string): string[] {
  const images = [resolve(`images/${name}`)];
  for (let n = 2; n <= MAX_GALLERY_FRAMES; n++) {
    const extra = resolveRaster(`images/${name}-${n}`);
    if (extra) images.push(extra);
  }
  return images;
}
