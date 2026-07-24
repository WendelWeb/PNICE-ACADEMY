/**
 * Certificate PDF builder — Task L3. Pure function (no env, no fetch, no DB):
 * given the display-ready strings a caller has already resolved, it renders a
 * landscape completion certificate with pdf-lib primitives only (no external
 * image assets — the ochre "seal" is drawn with circles/lines/text).
 *
 * Callers are responsible for locale-formatting `issuedDate` and building
 * `verifyUrl` — this module only lays out text, it never parses dates or
 * touches the network/DB. Mirrors the bilingual pattern in lib/email/templates.ts.
 */
import { PDFDocument, PDFFont, PDFPage, PageSizes, StandardFonts, degrees, rgb } from 'pdf-lib';

const INK = rgb(16 / 255, 32 / 255, 74 / 255);
const PAPER = rgb(237 / 255, 230 / 255, 214 / 255);
const OCHRE = rgb(217 / 255, 142 / 255, 43 / 255);
const GRAPHITE = rgb(43 / 255, 43 / 255, 40 / 255);

const COPY = {
  ht: {
    brand: 'PNICE ACADEMY',
    eyebrow: 'Sètifika dijital',
    title: 'Sètifika konpletasyon',
    intro: 'Sa a sètifye ke',
    body: 'te fini fòmasyon sa a avèk siksè',
    courseLabel: 'Fòmasyon',
    issuedLabel: 'Bay le',
    codeLabel: 'Kòd verifikasyon',
    verifyLabel: 'Verifye sou',
    sealLabel: 'OFISYÈL',
  },
  fr: {
    brand: 'PNICE ACADEMY',
    eyebrow: 'Certificat numérique',
    title: 'Certificat de réussite',
    intro: 'Ceci certifie que',
    body: 'a suivi et complété avec succès la formation',
    courseLabel: 'Formation',
    issuedLabel: 'Délivré le',
    codeLabel: 'Code de vérification',
    verifyLabel: 'Vérifier sur',
    sealLabel: 'OFFICIEL',
  },
} as const;

export type BuildCertificateInput = {
  recipientName: string;
  courseTitle: string;
  verificationCode: string;
  issuedDate: string;
  verifyUrl: string;
  locale: 'ht' | 'fr';
};

/** Greedy word-wrap using real glyph widths (never throws — falls back to the
 *  whole string as one "line" if it has no spaces to break on). */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

/** Shrinks the font size until the text fits within `maxLines`, down to
 *  `minSize`. Guarantees a result (possibly still overflowing at minSize for
 *  a pathologically long single word) rather than ever throwing. */
function fitWrapped(
  text: string,
  font: PDFFont,
  maxWidth: number,
  startSize: number,
  minSize: number,
  maxLines: number,
): { lines: string[]; size: number } {
  let size = startSize;
  let lines = wrapText(text, font, size, maxWidth);
  while (lines.length > maxLines && size > minSize) {
    size -= 1;
    lines = wrapText(text, font, size, maxWidth);
  }
  return { lines, size };
}

function drawCentered(
  page: PDFPage,
  text: string,
  opts: { xCenter: number; y: number; font: PDFFont; size: number; color: ReturnType<typeof rgb>; opacity?: number },
): number {
  const width = opts.font.widthOfTextAtSize(text, opts.size);
  page.drawText(text, {
    x: opts.xCenter - width / 2,
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: opts.color,
    opacity: opts.opacity,
  });
  return width;
}

/** Letter-spaced uppercase — approximates the site's tracked-caps mono
 *  headers (e.g. `tracking-[0.18em]`) using only drawText primitives. */
function drawTrackedCentered(
  page: PDFPage,
  text: string,
  opts: { xCenter: number; y: number; font: PDFFont; size: number; color: ReturnType<typeof rgb>; opacity?: number; tracking: number },
): void {
  const chars = text.split('');
  const totalWidth = chars.reduce(
    (w, c, i) => w + opts.font.widthOfTextAtSize(c, opts.size) + (i < chars.length - 1 ? opts.tracking : 0),
    0,
  );
  let x = opts.xCenter - totalWidth / 2;
  for (const c of chars) {
    page.drawText(c, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color, opacity: opts.opacity });
    x += opts.font.widthOfTextAtSize(c, opts.size) + opts.tracking;
  }
}

function drawWrappedCentered(
  page: PDFPage,
  lines: string[],
  opts: { xCenter: number; yTop: number; font: PDFFont; size: number; color: ReturnType<typeof rgb>; lineGap?: number },
): number {
  const lineHeight = opts.size * (opts.lineGap ?? 1.28);
  lines.forEach((line, i) => {
    drawCentered(page, line, { xCenter: opts.xCenter, y: opts.yTop - i * lineHeight, font: opts.font, size: opts.size, color: opts.color });
  });
  return lines.length * lineHeight;
}

/** Ochre "seal" drawn purely with pdf-lib primitives: a ticked outer ring, a
 *  filled inner disc, and a hand-drawn checkmark — no external image asset. */
function drawSeal(page: PDFPage, cx: number, cy: number, r: number, font: PDFFont, label: string): void {
  const tickCount = 32;
  for (let i = 0; i < tickCount; i++) {
    const angle = (i / tickCount) * Math.PI * 2;
    const inner = r - 5;
    const outer = r;
    page.drawLine({
      start: { x: cx + Math.cos(angle) * inner, y: cy + Math.sin(angle) * inner },
      end: { x: cx + Math.cos(angle) * outer, y: cy + Math.sin(angle) * outer },
      thickness: 1.2,
      color: OCHRE,
      opacity: 0.85,
    });
  }
  page.drawCircle({ x: cx, y: cy, size: r - 8, color: OCHRE, opacity: 0.16, borderColor: OCHRE, borderWidth: 1.5 });
  page.drawCircle({ x: cx, y: cy, size: r - 16, borderColor: INK, borderWidth: 1 });

  // Checkmark, hand-drawn from two line segments (avoids relying on a glyph
  // outside the WinAnsi encoding used by pdf-lib's standard fonts).
  const s = (r - 16) * 0.42;
  page.drawLine({ start: { x: cx - s, y: cy - s * 0.1 }, end: { x: cx - s * 0.25, y: cy - s * 0.75 }, thickness: 3, color: INK });
  page.drawLine({ start: { x: cx - s * 0.25, y: cy - s * 0.75 }, end: { x: cx + s, y: cy + s * 0.55 }, thickness: 3, color: INK });

  drawTrackedCentered(page, label, { xCenter: cx, y: cy - r - 13, font, size: 7, color: INK, opacity: 0.75, tracking: 1.2 });

  // Ribbon tails below the medal.
  page.drawRectangle({ x: cx - r * 0.52, y: cy - r - 34, width: 11, height: 22, color: OCHRE, opacity: 0.85, rotate: degrees(18) });
  page.drawRectangle({ x: cx + r * 0.42, y: cy - r - 34, width: 11, height: 22, color: OCHRE, opacity: 0.85, rotate: degrees(-18) });
}

export async function buildCertificatePdf(input: BuildCertificateInput): Promise<Uint8Array> {
  const t = COPY[input.locale] ?? COPY.ht;

  const doc = await PDFDocument.create();
  const [portraitW, portraitH] = PageSizes.A4;
  const width = portraitH; // landscape
  const height = portraitW;
  const page = doc.addPage([width, height]);

  const timesBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const courier = await doc.embedFont(StandardFonts.Courier);

  const cx = width / 2;
  const contentWidth = width - 220;

  // Paper background, full bleed.
  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });

  // Frame: a thick outer rule + a thin inner rule, echoing the site's
  // "official document" card recipe (border-2 + a fainter hairline).
  page.drawRectangle({ x: 28, y: 28, width: width - 56, height: height - 56, borderColor: INK, borderWidth: 2.4 });
  page.drawRectangle({ x: 36, y: 36, width: width - 72, height: height - 72, borderColor: INK, borderWidth: 0.75, borderOpacity: 0.35 });

  // Header.
  drawTrackedCentered(page, t.brand, { xCenter: cx, y: height - 78, font: timesBold, size: 16, color: INK, tracking: 3.2 });
  drawTrackedCentered(page, t.eyebrow, { xCenter: cx, y: height - 98, font: helvetica, size: 8.5, color: INK, opacity: 0.55, tracking: 2 });
  page.drawLine({ start: { x: cx - 130, y: height - 108 }, end: { x: cx + 130, y: height - 108 }, thickness: 1.4, color: INK });
  page.drawLine({ start: { x: cx - 130, y: height - 112 }, end: { x: cx + 130, y: height - 112 }, thickness: 0.6, color: INK, opacity: 0.3 });

  // Title.
  drawCentered(page, t.title, { xCenter: cx, y: height - 150, font: timesBold, size: 27, color: INK });
  drawCentered(page, t.intro, { xCenter: cx, y: height - 182, font: timesItalic, size: 12.5, color: GRAPHITE, opacity: 0.85 });

  // Recipient name — the marquee element; shrinks to fit rather than overflow.
  const name = input.recipientName?.trim() || '—';
  const nameFit = fitWrapped(name, timesBold, contentWidth, 34, 18, 2);
  const nameTop = height - 224;
  drawWrappedCentered(page, nameFit.lines, { xCenter: cx, yTop: nameTop, font: timesBold, size: nameFit.size, color: INK, lineGap: 1.15 });
  const nameLineHeight = nameFit.size * 1.15;
  const nameBottom = nameTop - (nameFit.lines.length - 1) * nameLineHeight - nameFit.size * 0.28;
  const widestNameLine = Math.max(...nameFit.lines.map((l) => timesBold.widthOfTextAtSize(l, nameFit.size)));
  page.drawLine({
    start: { x: cx - widestNameLine / 2 - 14, y: nameBottom },
    end: { x: cx + widestNameLine / 2 + 14, y: nameBottom },
    thickness: 1.4,
    color: OCHRE,
  });

  // Body + course title.
  drawCentered(page, t.body, { xCenter: cx, y: nameBottom - 26, font: helvetica, size: 12, color: GRAPHITE, opacity: 0.9 });
  const courseFit = fitWrapped(input.courseTitle?.trim() || '—', timesBold, contentWidth, 19, 12, 2);
  drawWrappedCentered(page, courseFit.lines, { xCenter: cx, yTop: nameBottom - 50, font: timesBold, size: courseFit.size, color: INK });

  // Footer strip: issued date / verification code / verify URL, mono-styled
  // like the receipt email's reference row.
  const footerY = 96;
  const footerLabelY = footerY + 16;
  page.drawLine({ start: { x: 70, y: footerY + 30 }, end: { x: width - 70, y: footerY + 30 }, thickness: 0.75, color: INK, opacity: 0.25 });

  const colCenters = [cx - 210, cx, cx + 210];
  const dateFit = fitWrapped(input.issuedDate || '—', helvetica, 150, 11, 8, 1);
  drawTrackedCentered(page, t.issuedLabel, { xCenter: colCenters[0], y: footerLabelY, font: helveticaBold, size: 7, color: INK, opacity: 0.55, tracking: 1.4 });
  drawCentered(page, dateFit.lines[0], { xCenter: colCenters[0], y: footerY, font: helvetica, size: dateFit.size, color: GRAPHITE });

  drawTrackedCentered(page, t.codeLabel, { xCenter: colCenters[1], y: footerLabelY, font: helveticaBold, size: 7, color: INK, opacity: 0.55, tracking: 1.4 });
  const codeFit = fitWrapped(input.verificationCode || '—', courier, 190, 12, 8, 1);
  drawCentered(page, codeFit.lines[0], { xCenter: colCenters[1], y: footerY, font: courier, size: codeFit.size, color: INK });

  drawTrackedCentered(page, t.verifyLabel, { xCenter: colCenters[2], y: footerLabelY, font: helveticaBold, size: 7, color: INK, opacity: 0.55, tracking: 1.4 });
  const urlFit = fitWrapped(input.verifyUrl || '—', courier, 190, 9, 5.5, 1);
  drawCentered(page, urlFit.lines[0], { xCenter: colCenters[2], y: footerY, font: courier, size: urlFit.size, color: GRAPHITE });

  // Seal, bottom-right of the frame.
  drawSeal(page, width - 128, 150, 44, helveticaBold, t.sealLabel);

  return doc.save();
}
