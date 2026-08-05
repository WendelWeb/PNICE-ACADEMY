/**
 * lib/uploads/resize-client.ts — the CLIENT-side (DOM/canvas) half of photo
 * prep, factored out of `components/admin/content/ImagesManager.tsx` (Stage
 * 7) so the apply-wizard photo uploader (`components/teacher/
 * ApplyPhotoUpload.tsx`) can share the EXACT same decode/resize/encode
 * pipeline instead of a second near-identical copy. The PURE, DOM-free half
 * of this (max-side math, alt text, blob naming) already lives in
 * `lib/uploads/image-prep.ts` — this file is the one piece that genuinely
 * needs `document`/`canvas`/`Image`, so it stays a separate module rather
 * than merging into that zero-DOM one.
 */
import { IMAGE_ENCODE_QUALITY, fitWithin } from './image-prep';

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Decodes `file` via a plain `<img>` (applies EXIF rotation everywhere, so a
 * phone photo never lands sideways), draws it to a canvas capped at
 * `IMAGE_MAX_SIDE` on the longest side (`fitWithin`), and encodes webp —
 * falling back to jpeg 0.85 where the browser can't produce real webp
 * (`canvas.toBlob` silently hands back a png there, hence the type check).
 * `null` = the file couldn't be decoded (not actually an image) or couldn't
 * be encoded — the caller shows a plain message, nothing was sent over the
 * network.
 */
export async function resizeImageFile(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement('img');
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    const webp = await canvasToBlob(canvas, 'image/webp', IMAGE_ENCODE_QUALITY);
    if (webp && webp.type === 'image/webp') return webp;
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', IMAGE_ENCODE_QUALITY);
    return jpeg && jpeg.type === 'image/jpeg' ? jpeg : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
