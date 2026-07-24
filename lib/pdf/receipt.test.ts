import { describe, it, expect } from 'vitest';
import { buildReceiptPdf } from './receipt';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

function isPdf(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

const base = {
  name: 'Jean' as string | null,
  itemName: 'Zouti finansye dijital',
  amountCents: 900,
  currency: 'usd',
  htgText: '1 200 HTG',
  dateIso: '2026-07-22T12:00:00Z',
  ref: 'pi_123',
} as const;

describe('buildReceiptPdf', () => {
  it('builds a valid PDF for the ht locale', async () => {
    const bytes = await buildReceiptPdf({ ...base, locale: 'ht' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    expect(isPdf(bytes)).toBe(true);
  });

  it('builds a valid PDF for the fr locale', async () => {
    const bytes = await buildReceiptPdf({ ...base, locale: 'fr' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    expect(isPdf(bytes)).toBe(true);
  });

  it('does not throw with a null name', async () => {
    const bytes = await buildReceiptPdf({ ...base, locale: 'fr', name: null });
    expect(isPdf(bytes)).toBe(true);
  });

  it('does not throw on a very long item name', async () => {
    const longItem = 'Yon atik ak yon non trè trè long ki ta dwe wrap sou plizyè liy san kraze '.repeat(5);
    const bytes = await buildReceiptPdf({ ...base, locale: 'ht', itemName: longItem });
    expect(isPdf(bytes)).toBe(true);
  });

  it('does not throw on a non-usd currency', async () => {
    const bytes = await buildReceiptPdf({ ...base, locale: 'fr', currency: 'htg', amountCents: 120000 });
    expect(isPdf(bytes)).toBe(true);
  });

  it('does not throw on an invalid dateIso', async () => {
    const bytes = await buildReceiptPdf({ ...base, locale: 'ht', dateIso: 'not-a-date' });
    expect(isPdf(bytes)).toBe(true);
  });
});
