import { describe, it, expect } from 'vitest';
import { buildCertificatePdf } from './certificate';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

function isPdf(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((b, i) => bytes[i] === b);
}

const base = {
  recipientName: 'Jean Baptiste',
  courseTitle: 'Zouti finansye dijital',
  verificationCode: 'PA-3K7Q9RXM',
  issuedDate: '22 jiyè 2026',
  verifyUrl: 'https://pnice.academy/ht/certificats/verifier/PA-3K7Q9RXM',
} as const;

describe('buildCertificatePdf', () => {
  it('builds a valid PDF for the ht locale', async () => {
    const bytes = await buildCertificatePdf({ ...base, locale: 'ht' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    expect(isPdf(bytes)).toBe(true);
  });

  it('builds a valid PDF for the fr locale', async () => {
    const bytes = await buildCertificatePdf({ ...base, locale: 'fr', issuedDate: '22 juillet 2026' });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    expect(isPdf(bytes)).toBe(true);
  });

  it('does not throw on a very long course title', async () => {
    const longTitle =
      'Yon fòmasyon konplè ak yon tit trè trè trè long ki ka fè wrapping lòjik la fè plizyè liy san li pa kraze rendering PDF la '.repeat(
        4,
      );
    const bytes = await buildCertificatePdf({ ...base, locale: 'fr', courseTitle: longTitle });
    expect(isPdf(bytes)).toBe(true);
  });

  it('does not throw on a very long recipient name', async () => {
    const longName = 'Jean-Baptiste Alexandre-Pierre Dominique de la Fontaine Toussaint-Louverture '.repeat(3);
    const bytes = await buildCertificatePdf({ ...base, locale: 'ht', recipientName: longName });
    expect(isPdf(bytes)).toBe(true);
  });

  it('does not throw on an empty recipient name', async () => {
    const bytes = await buildCertificatePdf({ ...base, locale: 'ht', recipientName: '' });
    expect(isPdf(bytes)).toBe(true);
  });

  it('does not throw on a long verify URL / verification code', async () => {
    const bytes = await buildCertificatePdf({
      ...base,
      locale: 'fr',
      verifyUrl: 'https://pnice.academy/fr/certificats/verifier/PA-3K7Q9RXM?ref=some-very-long-query-string-value',
      verificationCode: 'PA-ABCDEFGHIJKLMNOP',
    });
    expect(isPdf(bytes)).toBe(true);
  });
});
