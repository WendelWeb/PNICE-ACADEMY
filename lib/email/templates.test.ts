import { describe, it, expect } from 'vitest';
import {
  buildReceiptHtml,
  buildCartReminderHtml,
  buildDailyDigestHtml,
  buildTestEmailHtml,
  buildSupportReplyHtml,
  buildWelcomeHtml,
  buildCertificateEarnedHtml,
  buildPaymentFailedHtml,
  buildRefundConfirmationHtml,
  buildTicketReceivedHtml,
  buildTeacherApplicationReceivedHtml,
  buildTeacherApprovedHtml,
  buildTeacherRejectedHtml,
  buildCourseApprovedHtml,
  buildCourseRejectedHtml,
  buildTeacherSaleHtml,
  buildPayoutRequestedHtml,
  buildPayoutPaidHtml,
  buildPayoutRejectedHtml,
  buildPlatformPassSplitHtml,
  buildEngagementReminderHtml,
  monthLabel,
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
  // `rateHtg` is part of the base fixture because the builder now REQUIRES a
  // gourde source — an explicit live rate, or a frozen `htgExact`. There is
  // no third "just use the env constant" option, by design.
  const base = { name: 'Jean', itemName: 'Zouti finansye dijital', amountCents: 900, dateIso: '2026-07-22T12:00:00Z', ref: 'pi_123', rateHtg: 132 };

  it('builds a French receipt with USD amount and reference', () => {
    const { subject, html } = buildReceiptHtml({ ...base, locale: 'fr' });
    expect(subject).toContain('Reçu');
    expect(html).toContain('Zouti finansye dijital');
    expect(html).toContain('9,00 $ US');
    expect(html).toContain('pi_123');
    expect(html).toContain('Jean');
  });

  it('builds a Kreyòl receipt', () => {
    const { subject, html } = buildReceiptHtml({ ...base, locale: 'ht' });
    expect(subject).toContain('Resi');
    expect(html).toContain('9,00 $ US');
  });

  it('falls back gracefully without a name', () => {
    const { html } = buildReceiptHtml({ ...base, locale: 'fr', name: null });
    expect(html).toContain('Bonjour,');
  });

  it('escapes HTML in name and itemName', () => {
    const { html } = buildReceiptHtml({ locale: 'fr', name: '<img src=x onerror=alert(1)>', itemName: 'A & B <script>', amountCents: 900, dateIso: '2026-07-22T12:00:00Z', ref: 'pi_x', rateHtg: 132 });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('A &amp; B');
  });

  it('derives the (~X HTG) line from the rate it is given, exactly (fix/fx-rate-unify)', () => {
    const at132 = buildReceiptHtml({ ...base, locale: 'fr', rateHtg: 132 }).html;
    const at140 = buildReceiptHtml({ ...base, locale: 'fr', rateHtg: 140 }).html;
    expect(at140).not.toBe(at132);
    // base.amountCents is 900 → $9.00. EXACT conversion, no 50-HTG bucket:
    // the old round-to-50 rule is what made a page advertise one figure and
    // MonCash charge another (1 260 here, not 1 250).
    expect(at140).toContain((9 * 140).toLocaleString('fr-FR'));
    expect(at132).toContain((9 * 132).toLocaleString('fr-FR'));
  });

  describe('htgExact — the REAL MonCash charge, frozen at sale time (Stage 2 money-exactness pass)', () => {
    // Reproduces the live production sale the audit found: course $2.00,
    // MonCash actually took 264 HTG (usdCentsToHtg(200, 132)), but the OLD
    // receipt showed toHtgAt(2, rate) — 250 HTG — a real, live mismatch.
    const moncashCase = { ...base, locale: 'ht' as const, amountCents: 200 };

    it('shows the exact htgExact figure instead of deriving one from amountCents/rateHtg', () => {
      // Sale-time charge 264 HTG (the rate was 132 then); the rate is 135
      // today, so the derivation would say 270. htgExact must win outright.
      const { html, text } = buildReceiptHtml({ ...moncashCase, htgExact: 264, rateHtg: 135 });
      expect(html).toContain('264');
      expect(text).toContain('264');
      expect(html).not.toContain('270');
    });

    it('ignores rateHtg entirely once htgExact is set — a later FX-rate change cannot move it', () => {
      const atSaleTime = buildReceiptHtml({ ...moncashCase, htgExact: 264, rateHtg: 132 });
      const afterAdminMovedTheRate = buildReceiptHtml({ ...moncashCase, htgExact: 264, rateHtg: 135 });
      expect(afterAdminMovedTheRate.html).toBe(atSaleTime.html);
      expect(afterAdminMovedTheRate.text).toBe(atSaleTime.text);
    });

    it('rounds a fractional htgExact to the nearest whole gourde', () => {
      const { html } = buildReceiptHtml({ ...moncashCase, htgExact: 263.6 });
      expect(html).toContain('264');
    });

    it('falls back to the rateHtg derivation when htgExact is omitted (Stripe / no gourdes charged)', () => {
      const withExact = buildReceiptHtml({ ...moncashCase, htgExact: 264 });
      const withoutExact = buildReceiptHtml({ ...moncashCase, rateHtg: 135 });
      expect(withExact.html).not.toBe(withoutExact.html);
      // toHtgAt(2, 135) = 270 EXACTLY — the estimate path now lands on the
      // same number MonCash would charge today, not a 50-HTG bucket (250).
      expect(withoutExact.html).toContain('(~270 HTG)');
      expect(withoutExact.html).not.toContain('250 HTG');
    });
  });
});

describe('buildCartReminderHtml', () => {
  const base = { name: 'Jean', itemName: 'Kòmès sou entènèt', amountCents: 4900, rateHtg: 132 };

  it('builds a French reminder with amount and item', () => {
    const { subject, html } = buildCartReminderHtml({ ...base, locale: 'fr' });
    expect(subject).toContain('Kòmès sou entènèt');
    expect(html).toContain('Kòmès sou entènèt');
    expect(html).toContain('49,00 $ US');
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
    const { html } = buildCartReminderHtml({ locale: 'fr', name: '<b>x</b>', itemName: 'A & B <script>', amountCents: 100, rateHtg: 132 });
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
    expect(html).toContain('158,00 $ US');
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

/* -------------------------------------------------------------------------- */
/* Stage 6 — the complete transactional email loop.                           */
/* -------------------------------------------------------------------------- */

describe('monthLabel — YYYY-MM → human month', () => {
  it('spells kreyòl months out and formats French through Intl', () => {
    expect(monthLabel('2026-07', 'ht')).toBe('jiyè 2026');
    expect(monthLabel('2026-07', 'fr')).toBe('juillet 2026');
    expect(monthLabel('2026-01', 'ht')).toBe('janvye 2026');
    expect(monthLabel('2026-12', 'ht')).toBe('desanm 2026');
  });

  it('echoes a malformed period back unchanged', () => {
    expect(monthLabel('garbage', 'ht')).toBe('garbage');
    expect(monthLabel('2026-13', 'fr')).toBe('2026-13');
  });
});

describe('buildWelcomeHtml', () => {
  it('welcomes in kreyòl with a formations CTA', () => {
    const { subject, html, text } = buildWelcomeHtml({ locale: 'ht', name: 'Jean' });
    expect(subject).toBe('Byenveni sou PNICE Academy');
    expect(html).toContain('Bonjou Jean,');
    expect(html).toContain('/ht/formations');
    expect(text).toContain('/ht/formations');
  });

  it('welcomes in French and survives a null name', () => {
    const { subject, html } = buildWelcomeHtml({ locale: 'fr', name: null });
    expect(subject).toBe('Bienvenue sur PNICE Academy');
    expect(html).toContain('Bonjour,');
    expect(html).toContain('/fr/formations');
  });

  it('escapes a hostile display name', () => {
    const { html } = buildWelcomeHtml({ locale: 'ht', name: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});

describe('buildCertificateEarnedHtml', () => {
  const base = { name: 'Jean', courseTitle: 'Kòmès sou entènèt', code: 'PA-ABCD2345', verifyUrl: 'https://pnice.academy/ht/certificats/verifier/PA-ABCD2345' };

  it('carries the verification code AND the verify link (ht)', () => {
    const { subject, html, text } = buildCertificateEarnedHtml({ ...base, locale: 'ht' });
    expect(subject).toContain('Sètifika ou pare');
    expect(html).toContain('PA-ABCD2345');
    expect(html).toContain('href="https://pnice.academy/ht/certificats/verifier/PA-ABCD2345"');
    expect(text).toContain('PA-ABCD2345');
    expect(text).toContain('https://pnice.academy/ht/certificats/verifier/PA-ABCD2345');
  });

  it('builds in French', () => {
    const { subject, html } = buildCertificateEarnedHtml({ ...base, locale: 'fr' });
    expect(subject).toContain('certificat');
    expect(html).toContain('Félicitations');
  });

  it('escapes a hostile course title', () => {
    const { html } = buildCertificateEarnedHtml({ ...base, locale: 'ht', courseTitle: '<b>x</b> & y' });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; y');
  });
});

describe('buildPaymentFailedHtml — learner dunning', () => {
  it("uses the brief's exact kreyòl subject and links the /kont abonman tab", () => {
    const { subject, html, text } = buildPaymentFailedHtml({ locale: 'ht', name: 'Jean' });
    expect(subject).toBe('Peman an pa pase — mete kat ou ajou');
    expect(html).toContain('/ht/kont?tab=subscription');
    expect(text).toContain('/ht/kont?tab=subscription');
  });

  it('builds in French with the French tab link', () => {
    const { subject, html } = buildPaymentFailedHtml({ locale: 'fr', name: null });
    expect(subject).toContain('mets ta carte à jour');
    expect(html).toContain('/fr/kont?tab=subscription');
  });

  it('honours an explicit manageUrl', () => {
    const { html } = buildPaymentFailedHtml({ locale: 'ht', name: null, manageUrl: 'https://x.test/kont' });
    expect(html).toContain('href="https://x.test/kont"');
  });
});

describe('buildRefundConfirmationHtml', () => {
  it('confirms the refund with item + amount (ht)', () => {
    const { subject, html, text } = buildRefundConfirmationHtml({ locale: 'ht', name: 'Jean', itemName: 'Kòmès sou entènèt', amountCents: 4900 });
    expect(subject).toContain('Ranbousman');
    expect(html).toContain('Kòmès sou entènèt');
    expect(html).toContain('49,00 $ US');
    expect(text).toContain('49,00 $ US');
  });

  it('escapes the item name (fr)', () => {
    const { html } = buildRefundConfirmationHtml({ locale: 'fr', name: null, itemName: 'A & B <script>', amountCents: 900 });
    expect(html).not.toContain('<script>');
    expect(html).toContain('A &amp; B &lt;script&gt;');
  });
});

describe('buildTicketReceivedHtml', () => {
  it('quotes the subject back and carries the reference (ht)', () => {
    const { subject, html, text } = buildTicketReceivedHtml({ locale: 'ht', name: 'Jean', ticketSubject: 'Pwoblèm ak aksè', ref: 'tkt_42' });
    expect(subject).toContain('Nou resevwa mesaj ou');
    expect(html).toContain('Pwoblèm ak aksè');
    expect(html).toContain('tkt_42');
    expect(text).toContain('Pwoblèm ak aksè');
  });

  it('escapes a hostile ticket subject (fr)', () => {
    const { html } = buildTicketReceivedHtml({ locale: 'fr', name: null, ticketSubject: '<script>x</script>' });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});

describe('teacher application lifecycle emails', () => {
  it('application received — both locales', () => {
    expect(buildTeacherApplicationReceivedHtml({ locale: 'ht', name: 'Jan' }).subject).toContain('Nou resevwa aplikasyon w');
    expect(buildTeacherApplicationReceivedHtml({ locale: 'fr', name: 'Jan' }).subject).toContain('candidature');
  });

  it("approved says 'Ou ka kòmanse kreye kou' and links the studio", () => {
    const { subject, html } = buildTeacherApprovedHtml({ locale: 'ht', name: 'Jan' });
    expect(subject).toContain('ou ka kòmanse kreye kou');
    expect(html).toContain('/ht/enseigner/studio');
  });

  it('rejected carries the review note, escaped, in both locales', () => {
    const ht = buildTeacherRejectedHtml({ locale: 'ht', name: 'Jan', note: 'Bio <b>twò</b> kout & vag' });
    expect(ht.html).not.toContain('<b>twò</b>');
    expect(ht.html).toContain('Bio &lt;b&gt;twò&lt;/b&gt; kout &amp; vag');
    expect(ht.text).toContain('Bio <b>twò</b> kout & vag');
    const fr = buildTeacherRejectedHtml({ locale: 'fr', name: null, note: 'ligne 1\nligne 2' });
    // Newlines in the note survive as real line breaks.
    expect(fr.html).toContain('ligne 1<br>ligne 2');
  });
});

describe('course review emails', () => {
  it('approved carries the public link', () => {
    const { subject, html } = buildCourseApprovedHtml({
      locale: 'ht',
      name: 'Jan',
      courseTitle: 'Kouti pou debitan',
      publicUrl: 'https://pnice.academy/ht/formations/kouti',
    });
    expect(subject).toContain('Kou ou a pibliye');
    expect(html).toContain('href="https://pnice.academy/ht/formations/kouti"');
  });

  it('rejected carries the note (escaped) and the edit link', () => {
    const { html, text } = buildCourseRejectedHtml({
      locale: 'fr',
      name: 'Jan',
      courseTitle: 'Couture',
      note: 'Ajoute <videyo> & deskripsyon',
      editUrl: 'https://pnice.academy/fr/enseigner/studio/cours/kouti/editer',
    });
    expect(html).not.toContain('<videyo>');
    expect(html).toContain('Ajoute &lt;videyo&gt; &amp; deskripsyon');
    expect(html).toContain('href="https://pnice.academy/fr/enseigner/studio/cours/kouti/editer"');
    expect(text).toContain('Ajoute <videyo> & deskripsyon');
  });
});

describe('buildTeacherSaleHtml', () => {
  it("says 'Ou fè yon vant' with the net amount and real share pct", () => {
    const { subject, html, text } = buildTeacherSaleHtml({ locale: 'ht', name: 'Jan', itemName: 'Kouti pou debitan', netCents: 5530, netPct: 70 });
    expect(subject).toBe('Ou fè yon vant — Kouti pou debitan');
    expect(html).toContain('+55,30 $ US');
    expect(html).toContain('(70%)');
    expect(text).toContain('+55,30 $ US');
  });

  it('builds in French and escapes the item name', () => {
    const { subject, html } = buildTeacherSaleHtml({ locale: 'fr', name: null, itemName: 'A <b>B</b>', netCents: 700, netPct: 70 });
    expect(subject).toContain('Tu as fait une vente');
    expect(html).not.toContain('<b>B</b>');
    expect(html).toContain('A &lt;b&gt;B&lt;/b&gt;');
  });
});

describe('payout lifecycle emails', () => {
  it('requested confirms amount and method', () => {
    const { subject, html } = buildPayoutRequestedHtml({ locale: 'ht', name: 'Jan', amountCents: 5000, method: 'moncash' });
    expect(subject).toContain('Nou resevwa demann retrè w');
    expect(html).toContain('50,00 $ US');
    expect(html).toContain('moncash');
  });

  it('paid carries the reference in both locales', () => {
    const ht = buildPayoutPaidHtml({ locale: 'ht', name: 'Jan', amountCents: 5000, reference: 'MC-2026-001' });
    expect(ht.subject).toBe('Retrè w peye');
    expect(ht.html).toContain('MC-2026-001');
    expect(ht.text).toContain('MC-2026-001');
    expect(buildPayoutPaidHtml({ locale: 'fr', name: null, amountCents: 5000, reference: 'x' }).subject).toContain('retrait est payé');
  });

  it('rejected carries the note, escaped', () => {
    const { html, text } = buildPayoutRejectedHtml({ locale: 'ht', name: 'Jan', amountCents: 5000, note: 'Nimewo <MonCash> la pa bon & fèmen' });
    expect(html).not.toContain('<MonCash>');
    expect(html).toContain('Nimewo &lt;MonCash&gt; la pa bon &amp; fèmen');
    expect(text).toContain('Nimewo <MonCash> la pa bon & fèmen');
  });
});

describe('buildPlatformPassSplitHtml', () => {
  it("subject follows 'Pass PNICE — {month}: +$X' (ht)", () => {
    const { subject, html } = buildPlatformPassSplitHtml({ locale: 'ht', name: 'Jan', period: '2026-07', amountCents: 1234 });
    expect(subject).toBe('Pass PNICE — jiyè 2026: +12,34 $ US');
    expect(html).toContain('+12,34 $ US');
    expect(html).toContain('jiyè 2026');
  });

  it('builds in French with the French month', () => {
    const { subject } = buildPlatformPassSplitHtml({ locale: 'fr', name: null, period: '2026-07', amountCents: 1234 });
    expect(subject).toContain('juillet 2026');
    expect(subject).toContain('+12,34 $ US');
  });
});

describe('buildEngagementReminderHtml', () => {
  it('nudges in both locales with a dashboard CTA', () => {
    const ht = buildEngagementReminderHtml({ locale: 'ht', name: 'Jan' });
    expect(ht.subject).toContain('Kontinye fòmasyon ou');
    expect(ht.html).toContain('/ht/tableau-de-bord');
    const fr = buildEngagementReminderHtml({ locale: 'fr', name: null });
    expect(fr.subject).toContain('Continue ta formation');
    expect(fr.html).toContain('/fr/tableau-de-bord');
  });
});

describe('Stage 6 builders — text alternative has no leftover HTML', () => {
  it('every new builder returns a substantial, tag-free text part', () => {
    const HTML_TAG = /<\/?(p|div|table|tr|td|span|strong|a|h1|html|body|br)\b[^>]*>/i;
    const builds = [
      buildWelcomeHtml({ locale: 'ht', name: 'Jean' }),
      buildCertificateEarnedHtml({ locale: 'ht', name: 'Jean', courseTitle: 'Kou', code: 'PA-X', verifyUrl: 'https://pnice.academy/v' }),
      buildPaymentFailedHtml({ locale: 'fr', name: 'Jean' }),
      buildRefundConfirmationHtml({ locale: 'ht', name: null, itemName: 'Kou', amountCents: 900 }),
      buildTicketReceivedHtml({ locale: 'ht', name: 'Jean', ticketSubject: 'Sijè' }),
      buildTeacherApplicationReceivedHtml({ locale: 'fr', name: 'Jean' }),
      buildTeacherApprovedHtml({ locale: 'ht', name: 'Jean' }),
      buildTeacherRejectedHtml({ locale: 'ht', name: 'Jean', note: 'Nòt' }),
      buildCourseApprovedHtml({ locale: 'fr', name: 'Jean', courseTitle: 'Kou', publicUrl: 'https://pnice.academy/f' }),
      buildCourseRejectedHtml({ locale: 'ht', name: 'Jean', courseTitle: 'Kou', note: 'Nòt', editUrl: 'https://pnice.academy/e' }),
      buildTeacherSaleHtml({ locale: 'ht', name: 'Jean', itemName: 'Kou', netCents: 700, netPct: 70 }),
      buildPayoutRequestedHtml({ locale: 'fr', name: 'Jean', amountCents: 5000 }),
      buildPayoutPaidHtml({ locale: 'ht', name: 'Jean', amountCents: 5000, reference: 'ref' }),
      buildPayoutRejectedHtml({ locale: 'fr', name: 'Jean', amountCents: 5000, note: 'Nòt' }),
      buildPlatformPassSplitHtml({ locale: 'ht', name: 'Jean', period: '2026-07', amountCents: 1234 }),
      buildEngagementReminderHtml({ locale: 'ht', name: 'Jean' }),
    ];
    for (const { subject, html, text } of builds) {
      expect(subject.length).toBeGreaterThan(0);
      expect(html).toContain('<!doctype html>'); // wrapped in the shared layout
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(HTML_TAG);
      expect(text).toContain('PNICE Academy');
    }
  });
});

describe('plain-text alternative (deliverability)', () => {
  it('every builder returns non-empty text without leftover HTML tags', () => {
    const receipt = buildReceiptHtml({ locale: 'fr', name: 'Jean', itemName: 'Zouti finansye dijital', amountCents: 900, dateIso: '2026-07-22T12:00:00Z', ref: 'pi_123', rateHtg: 132 });
    const cart = buildCartReminderHtml({ locale: 'fr', name: 'Jean', itemName: 'Kòmès sou entènèt', amountCents: 4900, resumeUrl: 'https://pnice.academy/fr/checkout?course=x', rateHtg: 132 });
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
    expect(receipt.text).toContain('9,00 $ US');
    expect(cart.text).toContain('https://pnice.academy/fr/checkout?course=x');
    expect(digest.text).toContain('158,00 $ US');
  });
});
