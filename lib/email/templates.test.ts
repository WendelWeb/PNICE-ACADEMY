import { describe, it, expect } from 'vitest';
import { buildReceiptHtml, buildCartReminderHtml, buildDailyDigestHtml } from '@/lib/email/templates';

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

  it('uses an explicit rateHtg for the (~X HTG) line when given (fix/fx-rate-unify)', () => {
    const { html: withDefault } = buildReceiptHtml({ ...base, locale: 'fr' });
    const { html: withRate } = buildReceiptHtml({ ...base, locale: 'fr', rateHtg: 140 });
    expect(withRate).not.toBe(withDefault);
    // base.amountCents is 900 → $9.00 at an explicit 140 rate, rounded to 50.
    const expectedHtg = Math.round((9 * 140) / 50) * 50;
    expect(withRate).toContain(expectedHtg.toLocaleString('fr-FR'));
  });
});

describe('buildCartReminderHtml', () => {
  const base = { name: 'Jean', itemName: 'Kòmès sou entènèt', amountCents: 4900 };

  it('builds a French reminder with amount and item', () => {
    const { subject, html } = buildCartReminderHtml({ ...base, locale: 'fr' });
    expect(subject).toContain('Kòmès sou entènèt');
    expect(html).toContain('Kòmès sou entènèt');
    expect(html).toContain('$49.00');
    expect(html).toContain('Jean');
  });

  it('builds a Kreyòl reminder', () => {
    const { subject, html } = buildCartReminderHtml({ ...base, locale: 'ht' });
    expect(subject).toContain('Panye w ap tann ou');
    expect(html).toContain('Bonjou Jean,');
  });

  it('includes a resume link only when provided', () => {
    const withLink = buildCartReminderHtml({ ...base, locale: 'fr', resumeUrl: 'https://pnice.academy/fr/checkout?course=x' });
    expect(withLink.html).toContain('href="https://pnice.academy/fr/checkout?course=x"');
    const withoutLink = buildCartReminderHtml({ ...base, locale: 'fr' });
    expect(withoutLink.html).not.toContain('<a href=');
  });

  it('escapes HTML in name and itemName', () => {
    const { html } = buildCartReminderHtml({ locale: 'fr', name: '<b>x</b>', itemName: 'A & B <script>', amountCents: 100 });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('A &amp; B');
  });
});

describe('buildDailyDigestHtml', () => {
  const base = {
    dateIso: '2026-07-24T08:00:00Z',
    signupsToday: 3,
    enrollmentsToday: 2,
    revenueTodayCents: 15800,
    openTickets: 1,
    failedWebhooks: 0,
  };

  it('builds a French digest with all counts', () => {
    const { subject, html } = buildDailyDigestHtml({ ...base, locale: 'fr' });
    expect(subject).toContain('Résumé quotidien');
    expect(html).toContain('$158.00');
    expect(html).toContain('>3<');
    expect(html).toContain('>2<');
    expect(html).toContain('>1<');
  });

  it('builds a Kreyòl digest', () => {
    const { subject, html } = buildDailyDigestHtml({ ...base, locale: 'ht' });
    expect(subject).toContain('Rezime jodi a');
    expect(html).toContain('Nouvo kont');
  });

  it('flags open tickets / failed webhooks visually when nonzero', () => {
    const { html } = buildDailyDigestHtml({ ...base, locale: 'fr', failedWebhooks: 2 });
    expect(html).toContain('#B23A2E');
  });
});
