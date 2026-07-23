/**
 * Receipt PDF builder — Task L3. Pure function (no env, no fetch, no DB),
 * mirroring the field set of `buildReceiptHtml` (lib/email/templates.ts) so
 * the emailed receipt and the downloadable/attached PDF always agree: item,
 * amount (+ gourdes equivalent), date, reference.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

const INK = rgb(16 / 255, 32 / 255, 74 / 255);
const PAPER = rgb(237 / 255, 230 / 255, 214 / 255);
const GRAPHITE = rgb(43 / 255, 43 / 255, 40 / 255);
const MUTED = rgb(138 / 255, 133 / 255, 119 / 255); // ~#8a8577, matches the email template's muted labels

const COPY = {
  ht: {
    docTitle: 'Resi',
    hello: (name: string | null) => (name ? `Bonjou ${name},` : 'Bonjou,'),
    thanks: 'Mèsi pou acha w la. Men resi w :',
    item: 'Atik',
    amount: 'Montan',
    date: 'Dat',
    ref: 'Referans',
    foot: 'Aksè w deja aktif nan tablodbò w.',
  },
  fr: {
    docTitle: 'Reçu',
    hello: (name: string | null) => (name ? `Bonjour ${name},` : 'Bonjour,'),
    thanks: 'Merci pour ton achat. Voici ton reçu :',
    item: 'Article',
    amount: 'Montant',
    date: 'Date',
    ref: 'Référence',
    foot: 'Ton accès est déjà actif dans ton tableau de bord.',
  },
} as const;

export type BuildReceiptInput = {
  name: string | null;
  itemName: string;
  amountCents: number;
  currency: string;
  /** Pre-formatted gourdes equivalent, e.g. "1 200 HTG" (see lib/money.ts). */
  htgText: string;
  dateIso: string;
  ref: string;
  locale: 'ht' | 'fr';
};

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

function formatAmount(amountCents: number, currency: string): string {
  const major = (amountCents / 100).toFixed(2);
  const code = (currency || 'usd').toLowerCase();
  return code === 'usd' ? `$${major}` : `${major} ${code.toUpperCase()}`;
}

function formatDate(dateIso: string, locale: 'ht' | 'fr'): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return dateIso || '—';
  try {
    return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'fr-HT');
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function row(
  page: PDFPage,
  y: number,
  label: string,
  value: string,
  opts: { left: number; right: number; labelFont: PDFFont; valueFont: PDFFont; valueSize?: number; mono?: boolean },
): void {
  page.drawText(label, { x: opts.left, y, size: 9.5, font: opts.labelFont, color: MUTED });
  const size = opts.valueSize ?? 11;
  const w = opts.valueFont.widthOfTextAtSize(value, size);
  page.drawText(value, { x: opts.right - w, y, size, font: opts.valueFont, color: opts.mono ? GRAPHITE : INK });
}

export async function buildReceiptPdf(input: BuildReceiptInput): Promise<Uint8Array> {
  const t = COPY[input.locale] ?? COPY.ht;

  const doc = await PDFDocument.create();
  const width = 421.5; // half-A4-ish narrow "receipt" width
  const height = 595.28;
  const page = doc.addPage([width, height]);

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const left = 42;
  const right = width - 42;

  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, borderColor: INK, borderWidth: 1, borderOpacity: 0.15 });

  let y = height - 64;
  page.drawText('PNICE Academy', { x: left, y, size: 18, font: bold, color: INK });
  y -= 20;
  page.drawText(t.docTitle, { x: left, y, size: 10.5, font: regular, color: MUTED });

  y -= 34;
  const hello = t.hello(input.name?.trim() || null);
  page.drawText(hello, { x: left, y, size: 11, font: regular, color: GRAPHITE });

  y -= 18;
  const thanksLines = wrapText(t.thanks, regular, 11, right - left);
  for (const line of thanksLines) {
    page.drawText(line, { x: left, y, size: 11, font: regular, color: GRAPHITE });
    y -= 15;
  }

  y -= 12;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: INK, opacity: 0.15 });
  y -= 22;

  const itemLines = wrapText(input.itemName?.trim() || '—', bold, 11, (right - left) * 0.55);
  row(page, y, t.item, itemLines[0], { left, right, labelFont: regular, valueFont: bold });
  for (let i = 1; i < itemLines.length; i++) {
    y -= 14;
    const w = bold.widthOfTextAtSize(itemLines[i], 11);
    page.drawText(itemLines[i], { x: right - w, y, size: 11, font: bold, color: INK });
  }

  y -= 22;
  const amountValue = `${formatAmount(input.amountCents, input.currency)}  (~${input.htgText || '—'})`;
  row(page, y, t.amount, amountValue, { left, right, labelFont: regular, valueFont: bold });

  y -= 22;
  row(page, y, t.date, formatDate(input.dateIso, input.locale), { left, right, labelFont: regular, valueFont: regular });

  y -= 22;
  row(page, y, t.ref, input.ref || '—', { left, right, labelFont: regular, valueFont: mono, valueSize: 9.5, mono: true });

  y -= 18;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: INK, opacity: 0.15 });

  y -= 26;
  const footLines = wrapText(t.foot, regular, 10, right - left);
  for (const line of footLines) {
    page.drawText(line, { x: left, y, size: 10, font: regular, color: GRAPHITE, opacity: 0.85 });
    y -= 14;
  }

  return doc.save();
}
