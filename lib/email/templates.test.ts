import { describe, it, expect } from 'vitest';
import { buildReceiptHtml } from '@/lib/email/templates';

describe('buildReceiptHtml', () => {
  const base = { name: 'Jean', itemName: 'Zouti finansye dijital', amountCents: 900, dateIso: '2026-07-22T12:00:00Z', ref: 'pi_123' };

  it('builds a French receipt with USD amount and reference', () => {
    const { subject, html } = buildReceiptHtml({ ...base, locale: 'fr' });
    expect(subject).toContain('Reçu');
    expect(html).toContain('Zouti finansye dijital');
    expect(html).toContain('$9.00');
    expect(html).toContain('pi_123');
    expect(html).toContain('Jean');
  });

  it('builds a Kreyòl receipt', () => {
    const { subject, html } = buildReceiptHtml({ ...base, locale: 'ht' });
    expect(subject).toContain('Resi');
    expect(html).toContain('$9.00');
  });

  it('falls back gracefully without a name', () => {
    const { html } = buildReceiptHtml({ ...base, locale: 'fr', name: null });
    expect(html).toContain('Bonjour,');
  });

  it('escapes HTML in name and itemName', () => {
    const { html } = buildReceiptHtml({ locale: 'fr', name: '<img src=x onerror=alert(1)>', itemName: 'A & B <script>', amountCents: 900, dateIso: '2026-07-22T12:00:00Z', ref: 'pi_x' });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('A &amp; B');
  });
});
