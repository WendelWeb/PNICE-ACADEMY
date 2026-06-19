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

/** Secondary "in action" image. code 'PA-01' -> /images/courses/pa-01-b.* */
export function courseImageSrcB(code: string): string {
  return resolve(`images/courses/${code.toLowerCase()}-b`);
}

/** Gallery of secondary "in action" images: pa-0X-b, pa-0X-b-2, pa-0X-b-3, … */
export function courseImagesB(code: string): string[] {
  const slug = code.toLowerCase();
  const images = [resolve(`images/courses/${slug}-b`)];
  for (let n = 2; n <= MAX_GALLERY_FRAMES; n++) {
    const extra = resolveRaster(`images/courses/${slug}-b-${n}`);
    if (extra) images.push(extra);
  }
  return images;
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
