import fs from 'node:fs';
import path from 'node:path';

// Server-only. Resolves the image source for a course / site image:
// if the user has dropped a real raster (jpg/webp/png/avif) into /public,
// it is used and optimised; otherwise the branded SVG placeholder is served.

const RASTER_EXTS = ['jpg', 'jpeg', 'webp', 'avif', 'png'];

function resolve(relBase: string): string {
  for (const ext of RASTER_EXTS) {
    const abs = path.join(process.cwd(), 'public', `${relBase}.${ext}`);
    try {
      if (fs.existsSync(abs)) return `/${relBase}.${ext}`;
    } catch {
      /* ignore */
    }
  }
  return `/${relBase}.svg`;
}

/** code 'PA-01' -> /images/courses/pa-01.(jpg|webp|…|svg) */
export function courseImageSrc(code: string): string {
  return resolve(`images/courses/${code.toLowerCase()}`);
}

/** Secondary "in action" image. code 'PA-01' -> /images/courses/pa-01-b.* */
export function courseImageSrcB(code: string): string {
  return resolve(`images/courses/${code.toLowerCase()}-b`);
}

/** name 'hero' -> /images/hero.(jpg|webp|…|svg) */
export function siteImageSrc(name: string): string {
  return resolve(`images/${name}`);
}
