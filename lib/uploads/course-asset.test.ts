import { describe, it, expect } from 'vitest';
import {
  ASSET_MAX_BYTES,
  ASSET_ALLOWED_MIME,
  sniffAssetHead,
  validateCourseAsset,
  sanitizeAssetFileName,
  buildCourseAssetPath,
} from './course-asset';

/* ------------------------------ test fixtures ----------------------------- */

const HEADS = {
  jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01]),
  png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
  webp: Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]),
  pdf: Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x31]),
  zip: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x21, 0x00, 0x00, 0x00]),
  zipEmpty: Uint8Array.from([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  text: Uint8Array.from([0x42, 0x6f, 0x6e, 0x6a, 0x6f, 0x75, 0x72, 0x20, 0x50, 0x4e, 0x49, 0x43, 0x45, 0x21, 0x21, 0x21]),
};

describe('sniffAssetHead (hand-rolled magic bytes, no dependency)', () => {
  it('identifies each sniffable format from its header', () => {
    expect(sniffAssetHead(HEADS.jpeg)).toBe('jpeg');
    expect(sniffAssetHead(HEADS.png)).toBe('png');
    expect(sniffAssetHead(HEADS.webp)).toBe('webp');
    expect(sniffAssetHead(HEADS.pdf)).toBe('pdf');
    expect(sniffAssetHead(HEADS.zip)).toBe('zip');
    expect(sniffAssetHead(HEADS.zipEmpty)).toBe('zip');
  });

  it('returns null for unknown content and truncated heads', () => {
    expect(sniffAssetHead(HEADS.text)).toBeNull();
    expect(sniffAssetHead(new Uint8Array(0))).toBeNull();
    expect(sniffAssetHead(Uint8Array.from([0xff]))).toBeNull();
    // RIFF but not WEBP (e.g. a .wav) must NOT pass as webp.
    const wav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffAssetHead(wav)).toBeNull();
  });
});

describe('validateCourseAsset (the route decision table, pure)', () => {
  it('refuses an unknown purpose', () => {
    expect(validateCourseAsset({ purpose: 'video', mime: 'image/png', size: 10, head: HEADS.png })).toEqual({
      ok: false,
      message: 'invalid_purpose',
    });
    expect(validateCourseAsset({ purpose: '', mime: 'image/png', size: 10, head: HEADS.png }).ok).toBe(false);
  });

  it('accepts each allowed image type with a matching header', () => {
    for (const [mime, head] of [
      ['image/jpeg', HEADS.jpeg],
      ['image/png', HEADS.png],
      ['image/webp', HEADS.webp],
    ] as const) {
      const result = validateCourseAsset({ purpose: 'image', mime, size: 1024, head });
      expect(result).toEqual({ ok: true, purpose: 'image', mime, maxBytes: ASSET_MAX_BYTES.image });
    }
  });

  it('refuses non-image MIME for purpose image (incl. types fine as resources)', () => {
    expect(validateCourseAsset({ purpose: 'image', mime: 'application/pdf', size: 10, head: HEADS.pdf })).toEqual({
      ok: false,
      message: 'unsupported_type',
    });
    // SVG is deliberately not an accepted image (XSS via inline script).
    expect(validateCourseAsset({ purpose: 'image', mime: 'image/svg+xml', size: 10 }).ok).toBe(false);
    expect(validateCourseAsset({ purpose: 'image', mime: 'text/html', size: 10 }).ok).toBe(false);
  });

  it('normalises MIME (case, charset suffix, Windows zip alias)', () => {
    const pdf = validateCourseAsset({ purpose: 'resource', mime: 'Application/PDF; charset=binary', size: 10, head: HEADS.pdf });
    expect(pdf.ok).toBe(true);
    if (pdf.ok) expect(pdf.mime).toBe('application/pdf');
    const zip = validateCourseAsset({ purpose: 'resource', mime: 'application/x-zip-compressed', size: 10, head: HEADS.zip });
    expect(zip.ok).toBe(true);
    if (zip.ok) expect(zip.mime).toBe('application/zip');
  });

  it('enforces the per-purpose size caps (8MB image, 25MB resource)', () => {
    expect(validateCourseAsset({ purpose: 'image', mime: 'image/png', size: 8 * 1024 * 1024, head: HEADS.png }).ok).toBe(true);
    expect(validateCourseAsset({ purpose: 'image', mime: 'image/png', size: 8 * 1024 * 1024 + 1, head: HEADS.png })).toEqual({
      ok: false,
      message: 'too_large',
    });
    expect(validateCourseAsset({ purpose: 'resource', mime: 'application/pdf', size: 25 * 1024 * 1024, head: HEADS.pdf }).ok).toBe(true);
    expect(validateCourseAsset({ purpose: 'resource', mime: 'application/pdf', size: 25 * 1024 * 1024 + 1, head: HEADS.pdf })).toEqual({
      ok: false,
      message: 'too_large',
    });
  });

  it('refuses empty or nonsense sizes', () => {
    expect(validateCourseAsset({ purpose: 'image', mime: 'image/png', size: 0, head: HEADS.png })).toEqual({ ok: false, message: 'empty_file' });
    expect(validateCourseAsset({ purpose: 'image', mime: 'image/png', size: -5, head: HEADS.png }).ok).toBe(false);
    expect(validateCourseAsset({ purpose: 'image', mime: 'image/png', size: Number.NaN, head: HEADS.png }).ok).toBe(false);
  });

  it('refuses content that does not match the declared MIME (magic bytes)', () => {
    // A PNG renamed/declared as JPEG.
    expect(validateCourseAsset({ purpose: 'image', mime: 'image/jpeg', size: 10, head: HEADS.png })).toEqual({
      ok: false,
      message: 'content_mismatch',
    });
    // Plain text declared as PDF.
    expect(validateCourseAsset({ purpose: 'resource', mime: 'application/pdf', size: 10, head: HEADS.text })).toEqual({
      ok: false,
      message: 'content_mismatch',
    });
    // Sniffable MIME with NO head available: content must prove itself.
    expect(validateCourseAsset({ purpose: 'image', mime: 'image/png', size: 10 })).toEqual({
      ok: false,
      message: 'content_mismatch',
    });
  });

  it('treats the OOXML family as zip containers (docx must sniff as zip)', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(validateCourseAsset({ purpose: 'resource', mime: docx, size: 10, head: HEADS.zip }).ok).toBe(true);
    expect(validateCourseAsset({ purpose: 'resource', mime: docx, size: 10, head: HEADS.text })).toEqual({
      ok: false,
      message: 'content_mismatch',
    });
  });

  it('accepts non-sniffable resource types (legacy office, text/plain) on MIME+size alone', () => {
    for (const mime of ['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'text/plain']) {
      expect(ASSET_ALLOWED_MIME.resource).toContain(mime);
      expect(validateCourseAsset({ purpose: 'resource', mime, size: 10, head: HEADS.text }).ok).toBe(true);
    }
  });
});

describe('sanitizeAssetFileName (whitelist, traversal-proof, MIME-forced extension)', () => {
  it('keeps a plain name and forces the extension from the validated MIME', () => {
    // Client says .png in the name but the VALIDATED mime is jpeg → .jpg wins.
    expect(sanitizeAssetFileName('photo.png', 'image/jpeg')).toBe('photo.jpg');
    expect(sanitizeAssetFileName('syllabus.pdf', 'application/pdf')).toBe('syllabus.pdf');
    expect(sanitizeAssetFileName('devoir.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('devoir.docx');
  });

  it('strips directory components — only the last segment survives', () => {
    expect(sanitizeAssetFileName('a/b/c.pdf', 'application/pdf')).toBe('c.pdf');
    expect(sanitizeAssetFileName('C:\\Users\\prof\\photo.jpg', 'image/jpeg')).toBe('photo.jpg');
  });

  it('neutralises traversal attempts, including percent-encoded ones', () => {
    for (const attack of ['../../x', '..\\..\\x', '..%2F', '..%2f..%2fetc%2fpasswd', '....//x', '%2e%2e%2fx']) {
      const out = sanitizeAssetFileName(attack, 'application/pdf');
      expect(out).not.toContain('..');
      expect(out).not.toContain('/');
      expect(out).not.toContain('\\');
      expect(out).toMatch(/^[a-z0-9][a-z0-9\-_.]*\.pdf$/);
    }
  });

  it('never yields a hidden file (leading dot) or empty base', () => {
    expect(sanitizeAssetFileName('.htaccess', 'text/plain')).toBe('htaccess.txt');
    expect(sanitizeAssetFileName('', 'image/png')).toBe('fichye.png');
    expect(sanitizeAssetFileName('...', 'image/png')).toBe('fichye.png');
    expect(sanitizeAssetFileName('///', 'image/png')).toBe('fichye.png');
  });

  it('transliterates nothing but stays safe on unicode names', () => {
    const out = sanitizeAssetFileName('Foto pwofesè à l’école 📚.jpeg', 'image/jpeg');
    expect(out).toMatch(/^[a-z0-9][a-z0-9\-_.]*\.jpg$/);
    expect(out).toContain('foto');
  });

  it('collapses repeated separators and caps the base length', () => {
    expect(sanitizeAssetFileName('a----b____c.pdf', 'application/pdf')).toBe('a-b_c.pdf');
    const long = `${'x'.repeat(200)}.pdf`;
    const out = sanitizeAssetFileName(long, 'application/pdf');
    expect(out.length).toBeLessThanOrEqual(48 + '.pdf'.length);
    expect(out.endsWith('.pdf')).toBe(true);
  });

  it('does not trust a dangerous client double-extension', () => {
    // The last (client) extension is dropped; the validated MIME's is appended.
    const out = sanitizeAssetFileName('invoice.pdf.exe', 'application/pdf');
    expect(out).toBe('invoice.pdf.pdf');
    expect(out.endsWith('.pdf')).toBe(true);
    expect(out).not.toContain('exe');
  });
});

describe('buildCourseAssetPath', () => {
  it('builds courses/<slug>/<purpose>/<stamp>-<safe> with a base36 stamp', () => {
    const path = buildCourseAssetPath({
      slug: 'zouti-finansye-dijital',
      purpose: 'image',
      fileName: 'Foto Kouvèti.PNG',
      mime: 'image/png',
      now: 1_700_000_000_000,
    });
    expect(path).toMatch(/^courses\/zouti-finansye-dijital\/image\/[a-z0-9]+-foto-kouv-ti\.png$/);
    expect(path.startsWith(`courses/zouti-finansye-dijital/image/${(1_700_000_000_000).toString(36)}`)).toBe(true);
  });

  it('sanitizes a hostile slug — no traversal through the slug segment either', () => {
    const path = buildCourseAssetPath({ slug: '../../etc', purpose: 'resource', fileName: 'x.pdf', mime: 'application/pdf' });
    expect(path).not.toContain('..');
    expect(path).toMatch(/^courses\/etc\/resource\/[a-z0-9]+-x\.pdf$/);
  });

  it('falls back to a safe slug segment when the slug is unusable', () => {
    const path = buildCourseAssetPath({ slug: '///', purpose: 'image', fileName: 'a.png', mime: 'image/png' });
    expect(path).toMatch(/^courses\/kou\/image\/[a-z0-9]+-a\.png$/);
  });

  it('produces distinct paths for two uploads of the same file name', () => {
    const input = { slug: 's', purpose: 'image' as const, fileName: 'same.png', mime: 'image/png' };
    const a = buildCourseAssetPath(input);
    const b = buildCourseAssetPath(input);
    expect(a).not.toBe(b);
  });
});
