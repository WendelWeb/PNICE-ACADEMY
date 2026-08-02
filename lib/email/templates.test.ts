import { describe, it, expect } from 'vitest';
import {
  buildReceiptHtml,
  buildCartReminderHtml,
  buildDailyDigestHtml,
  buildTestEmailHtml,
  buildSupportReplyHtml,
} from '@/lib/email/templates';

describe('buildSupportReplyHtml', () => {
  const base = { name: 'Jean', ticketSubject: 'Pwoblèm ak aksè kou a', body: 'Bonjou,\nAksè w la aktive ankò.' };

  it('quotes the original subject and keeps the admin reply', () => {
    const { subject, html, text } = buildSupportReplyHtml({ ...base, locale: 'ht', ref: 'tkt_9' });
    expect(subject).toBe('Re: Pwoblèm ak aksè kou a — PNICE Academy');
    expect(html).toContain('Pwoblèm ak aksè kou a');
    expect(html).toContain('Aksè w la aktive ankò.');
    expect(html).toContain('tkt_9');
    expect(text).toContain('Aksè w la aktive ankò.');
  });

  it('escapes the admin body before turning newlines into <br>', () => {
    const { html } = buildSupportReplyHtml({
      ...base,
      locale: 'fr',
      body: 'Regarde <script>alert(1)</script>\nligne 2 & fin',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp; fin');
    // The newline still becomes a real line break — escaping must not eat it.
    expect(html).toContain('ligne 2');
    expect(html).toMatch(/&lt;\/script&gt;<br>ligne 2/);
  });

  it('escapes a hostile ticket subject in the quoted block', () => {
    const { html } = buildSupportReplyHtml({ ...base, locale: 'fr', ticketSubject: '<b>gras</b>' });
    expect(html).toContain('&lt;b&gt;gras&lt;/b&gt;');
  });

  it('works without a name or a reference', () => {
    const { html, text } = buildSupportReplyHtml({ ...base, locale: 'fr', name: null, ref: null });
    expect(html).toContain('Bonjour,');
    expect(text).not.toContain('Référence');
  });
});

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
    // Intent: no CTA BUTTON renders without a resumeUrl. (The layout's footer
    // always carries a link to the site, so "no anchor at all" is no longer
    // the right assertion — the absence of the CTA label is.)
    const withoutLink = buildCartReminderHtml({ ...base, locale: 'fr' });
    expect(withoutLink.html).not.toContain('Reprendre mon achat');
    expect(withoutLink.text).not.toContain('Reprendre mon achat');
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

  it('CTA links to /admin', () => {
    const { html } = buildDailyDigestHtml({ ...base, locale: 'fr' });
    expect(html).toContain('/fr/admin');
  });
});

describe('buildTestEmailHtml', () => {
  it('builds a French test email with subject and body', () => {
    const { subject, html } = buildTestEmailHtml({ locale: 'fr' });
    expect(subject).toContain('Test');
    expect(html).toContain('Resend');
  });

  it('builds a Kreyòl test email', () => {
    const { subject, html } = buildTestEmailHtml({ locale: 'ht' });
    expect(subject).toContain('Tès');
    expect(html).toContain('Resend');
  });

  it('includes a diagnostic block with the effective sender and a date', () => {
    const { html } = buildTestEmailHtml({
      locale: 'fr',
      from: 'PNICE Academy <no-reply@pnice.academy>',
      dateIso: '2026-07-30T12:00:00Z',
    });
    expect(html).toContain('no-reply@pnice.academy');
  });

  it('escapes an admin name', () => {
    const { html } = buildTestEmailHtml({ locale: 'fr', adminName: '<b>x</b>' });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('plain-text alternative (deliverability)', () => {
  it('every builder returns non-empty text without leftover HTML tags', () => {
    const receipt = buildReceiptHtml({ locale: 'fr', name: 'Jean', itemName: 'Zouti finansye dijital', amountCents: 900, dateIso: '2026-07-22T12:00:00Z', ref: 'pi_123' });
    const cart = buildCartReminderHtml({ locale: 'fr', name: 'Jean', itemName: 'Kòmès sou entènèt', amountCents: 4900, resumeUrl: 'https://pnice.academy/fr/checkout?course=x' });
    const test = buildTestEmailHtml({ locale: 'fr' });
    const digest = buildDailyDigestHtml({
      locale: 'fr',
      dateIso: '2026-07-24T08:00:00Z',
      signupsToday: 3,
      enrollmentsToday: 2,
      revenueTodayCents: 15800,
      openTickets: 1,
      failedWebhooks: 0,
    });

    // Detects actual leftover markup (tags with attributes/children, e.g.
    // `<p style=…>` or `</table>`) without false-positiving on the RFC
    // "Name <email>" sender format the test builder's diagnostic block
    // legitimately includes (e.g. "PNICE Academy <no-reply@pnice.academy>").
    const HTML_TAG = /<\/?(p|div|table|tr|td|span|strong|a|h1|html|body|br)\b[^>]*>/i;
    for (const { text } of [receipt, cart, test, digest]) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(HTML_TAG);
    }

    const reply = buildSupportReplyHtml({
      locale: 'fr',
      name: 'Jean',
      ticketSubject: 'Aksè kou a',
      body: 'Bonjour,\nTon accès est réactivé.',
      ref: 'tkt_1',
    });
    expect(reply.text.length).toBeGreaterThan(0);
    expect(reply.text).not.toMatch(HTML_TAG);

    expect(receipt.text).toContain('Zouti finansye dijital');
    expect(receipt.text).toContain('$9.00');
    expect(cart.text).toContain('https://pnice.academy/fr/checkout?course=x');
    expect(digest.text).toContain('$158.00');
  });
});
