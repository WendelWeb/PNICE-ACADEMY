/**
 * Bilingual transactional email bodies. Pure functions (no env, no fetch) so
 * they are unit-testable; sending stays in lib/email/resend.ts.
 *
 * Every builder wraps its content through lib/email/layout.ts's
 * `emailLayout()` — the shared, Outlook-safe, branded shell (preheader,
 * kraft header + ochre seal, white content card, bulletproof CTA, footer).
 * Each builder ALSO returns a `text` plain-text alternative (deliverability +
 * accessibility) alongside the existing `{ subject, html }` shape — additive
 * only, so every existing call site keeps compiling unchanged.
 */
import { toHtgAt, USD_TO_HTG } from '@/lib/money';
import { emailLayout, emailRow, emailTable, escapeHtml, SITE_URL, COLORS } from '@/lib/email/layout';
import { DEFAULT_FROM } from '@/lib/email/resend';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Shared "Bonjour X," / "Bonjou X," greeting, used by both the HTML body
 *  (escaped) and the plain-text alternative (raw) — `esc` is the identity
 *  function for the latter. */
const helloLine = (name: string | null, fr: boolean, esc: (s: string) => string): string =>
  name ? (fr ? `Bonjour ${esc(name)},` : `Bonjou ${esc(name)},`) : fr ? 'Bonjour,' : 'Bonjou,';

export function buildReceiptHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  itemName: string;
  amountCents: number;
  dateIso: string;
  ref: string;
  /** USD→HTG rate for the "(~X HTG)" line, ideally the live DB rate
   *  (lib/fx.ts's `getFxRate`) passed by the caller (lib/payments/fulfill.ts).
   *  Optional + defaults to the env constant so existing callers/tests keep
   *  working unchanged (Task fix/fx-rate-unify). */
  rateHtg?: number;
}): { subject: string; html: string; text: string } {
  const fr = input.locale === 'fr';
  const htg = Math.round(toHtgAt(input.amountCents / 100, input.rateHtg ?? USD_TO_HTG)).toLocaleString('fr-FR');
  const date = new Date(input.dateIso).toLocaleDateString(fr ? 'fr-FR' : 'fr-HT');
  const helloHtml = helloLine(input.name, fr, escapeHtml);
  const helloPlain = helloLine(input.name, fr, (s) => s);
  const subject = fr
    ? `Reçu — ${input.itemName} — PNICE Academy`
    : `Resi — ${input.itemName} — PNICE Academy`;
  const lines = fr
    ? {
        heading: 'Merci',
        thanks: 'Merci pour ton achat. Voici ton reçu :',
        item: 'Article',
        amount: 'Montant',
        date: 'Date',
        ref: 'Référence',
        foot: 'Ton accès est déjà actif dans ton tableau de bord.',
        cta: 'Voir mon tableau de bord',
      }
    : {
        heading: 'Mèsi',
        thanks: 'Mèsi pou acha w la. Men resi w :',
        item: 'Atik',
        amount: 'Montan',
        date: 'Dat',
        ref: 'Referans',
        foot: 'Aksè w deja aktif nan tablodbò w.',
        cta: 'Gade tablodbò m',
      };

  const amountHtml = `<strong>${usd(input.amountCents)}</strong> <span style="color:${COLORS.muted};">(~${htg} HTG)</span>`;
  const rows = [
    emailRow(lines.item, escapeHtml(input.itemName)),
    emailRow(lines.amount, amountHtml),
    emailRow(lines.date, date),
    emailRow(lines.ref, `<span style="font-family:'Courier New',Courier,monospace;font-size:12px;">${escapeHtml(input.ref)}</span>`),
  ].join('');

  const bodyHtml = `
            <p style="margin:0 0 14px;">${helloHtml}</p>
            <p style="margin:0 0 18px;">${lines.thanks}</p>
            ${emailTable(rows)}
            <p style="margin:16px 0 0;">${lines.foot}</p>`;

  const preheader = fr
    ? `Ton reçu pour ${input.itemName} — ${usd(input.amountCents)}`
    : `Resi w pou ${input.itemName} — ${usd(input.amountCents)}`;

  const dashboardUrl = `${SITE_URL}/${input.locale}/tableau-de-bord`;

  const html = emailLayout({
    locale: input.locale,
    preheader,
    heading: lines.heading,
    bodyHtml,
    cta: { label: lines.cta, url: dashboardUrl },
  });

  const text = [
    helloPlain,
    '',
    lines.thanks,
    '',
    `${lines.item}: ${input.itemName}`,
    `${lines.amount}: ${usd(input.amountCents)} (~${htg} HTG)`,
    `${lines.date}: ${date}`,
    `${lines.ref}: ${input.ref}`,
    '',
    lines.foot,
    '',
    `${lines.cta}: ${dashboardUrl}`,
    '',
    '--',
    'PNICE Academy',
  ].join('\n');

  return { subject, html, text };
}

/** Abandoned-cart relance email (Task L5 — app/api/cron/abandoned-carts).
 *  `resumeUrl` is optional so the pure builder stays testable with no origin
 *  in hand; the cron route passes an absolute `/checkout[?course=slug]` link. */
export function buildCartReminderHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  itemName: string;
  amountCents: number;
  resumeUrl?: string | null;
  /** USD→HTG rate for the "(~X HTG)" line, ideally the live DB rate
   *  (lib/fx.ts's `getFxRate`) passed by the caller
   *  (app/api/cron/abandoned-carts/route.ts). Optional + defaults to the env
   *  constant so existing callers/tests keep working unchanged (Task
   *  fix/fx-rate-unify — same shape as `buildReceiptHtml`'s `rateHtg`). */
  rateHtg?: number;
}): { subject: string; html: string; text: string } {
  const fr = input.locale === 'fr';
  const htg = Math.round(toHtgAt(input.amountCents / 100, input.rateHtg ?? USD_TO_HTG)).toLocaleString('fr-FR');
  const helloHtml = helloLine(input.name, fr, escapeHtml);
  const helloPlain = helloLine(input.name, fr, (s) => s);
  const subject = fr
    ? `Ton panier t'attend — ${input.itemName}`
    : `Panye w ap tann ou — ${input.itemName}`;
  const lines = fr
    ? {
        heading: "Ton panier t'attend",
        body: `Tu as commencé un achat mais tu ne l'as pas terminé. Ton accès t'attend — reviens finaliser quand tu veux :`,
        cta: 'Reprendre mon achat',
        foot: 'Une question ? Réponds simplement à cet e-mail.',
      }
    : {
        heading: 'Panye w ap tann ou',
        body: `Ou te kòmanse yon acha men ou pa t fini li. Aksè w ap tann ou — retounen fini lè w vle :`,
        cta: 'Kontinye acha m nan',
        foot: 'Yon kesyon? Reponn imèl sa a dirèk.',
      };

  const itemLineHtml = `<p style="margin:0;"><strong>${escapeHtml(input.itemName)}</strong> — ${usd(input.amountCents)} <span style="color:${COLORS.muted};">(~${htg} HTG)</span></p>`;
  const bodyHtml = `
            <p style="margin:0 0 14px;">${helloHtml}</p>
            <p style="margin:0 0 16px;">${lines.body}</p>
            ${itemLineHtml}`;

  const preheader = fr
    ? `${input.itemName} t'attend — reviens finaliser ton achat`
    : `${input.itemName} ap tann ou — retounen fini acha w`;

  const html = emailLayout({
    locale: input.locale,
    preheader,
    heading: lines.heading,
    bodyHtml,
    cta: input.resumeUrl ? { label: lines.cta, url: input.resumeUrl } : undefined,
    footerNote: lines.foot,
  });

  const text = [
    helloPlain,
    '',
    lines.body,
    '',
    `${input.itemName} — ${usd(input.amountCents)} (~${htg} HTG)`,
    ...(input.resumeUrl ? ['', `${lines.cta}: ${input.resumeUrl}`] : []),
    '',
    lines.foot,
  ].join('\n');

  return { subject, html, text };
}

/** Admin "send a test email" button (admin/sante — health page). Pure/
 *  testable; confirms the Resend wiring (key + verified `from` domain) end to
 *  end by sending to the acting admin's own address. `from`/`dateIso` are
 *  optional so the builder stays pure and testable — the caller
 *  (sendTestEmailAction) passes the actual effective sender + timestamp for
 *  the diagnostic block, since it already computes both before calling in. */
export function buildTestEmailHtml(input: {
  locale: 'fr' | 'ht';
  adminName?: string | null;
  from?: string;
  dateIso?: string;
}): { subject: string; html: string; text: string } {
  const fr = input.locale === 'fr';
  const helloHtml = helloLine(input.adminName ?? null, fr, escapeHtml);
  const helloPlain = helloLine(input.adminName ?? null, fr, (s) => s);
  const subject = fr ? 'Test — PNICE Academy' : 'Tès — PNICE Academy';
  const body = fr
    ? "Ceci est un email de test envoyé depuis la page Santé système de l'administration. S'il est bien arrivé dans ta boîte de réception, l'envoi via Resend fonctionne correctement."
    : 'Sa se yon imèl tès ki voye soti nan paj Sante sistèm nan (administrasyon an). Si li rive byen nan bwat resepsyon w, sa vle di anvwa Resend la ap mache byen.';

  const from = input.from ?? DEFAULT_FROM;
  const dateIso = input.dateIso ?? new Date().toISOString();
  const dateLabel = new Date(dateIso).toLocaleString(fr ? 'fr-FR' : 'fr-HT');

  const diag = fr
    ? { title: 'Diagnostic', sender: 'Expéditeur', date: 'Date' }
    : { title: 'Dyagnostik', sender: 'Ekspeditè', date: 'Dat' };

  const rows = [emailRow(diag.sender, escapeHtml(from)), emailRow(diag.date, dateLabel)].join('');

  const bodyHtml = `
            <p style="margin:0 0 14px;">${helloHtml}</p>
            <p style="margin:0 0 18px;">${body}</p>
            <p style="margin:0 0 8px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted};">${diag.title}</p>
            ${emailTable(rows)}`;

  const preheader = fr
    ? 'Test de configuration Resend — PNICE Academy'
    : 'Tès konfigirasyon Resend — PNICE Academy';

  const html = emailLayout({
    locale: input.locale,
    preheader,
    heading: fr ? 'Test de configuration' : 'Tès konfigirasyon',
    bodyHtml,
  });

  const text = [
    helloPlain,
    '',
    body,
    '',
    `${diag.title}:`,
    `${diag.sender}: ${from}`,
    `${diag.date}: ${dateLabel}`,
  ].join('\n');

  return { subject, html, text };
}

/**
 * Support-ticket reply sent to the learner when an admin answers their
 * ticket (lib/admin/support-actions.ts's `replyTicketAction`). Pure/testable.
 *
 * The admin's `body` is free text typed into the admin console: it is
 * ESCAPED before the newline→`<br>` conversion, so a message containing
 * `<` or `&` renders literally instead of injecting markup into the email
 * (the previous inline template interpolated it raw).
 *
 * The original ticket subject is quoted back in a bordered block so the
 * learner recognises which of their questions this answers — a reply that
 * arrives with no context is the classic support-email failure.
 */
export function buildSupportReplyHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  /** The learner's original ticket subject, quoted back for context. */
  ticketSubject: string;
  /** The admin's reply, as typed (plain text, newline-separated). */
  body: string;
  /** Short ticket reference shown in the footer, e.g. the ticket id. */
  ref?: string | null;
}): { subject: string; html: string; text: string } {
  const fr = input.locale === 'fr';
  const helloHtml = helloLine(input.name, fr, escapeHtml);
  const helloPlain = helloLine(input.name, fr, (s) => s);

  const subject = `Re: ${input.ticketSubject} — PNICE Academy`;
  const intro = fr
    ? 'Voici notre réponse à ta demande :'
    : 'Men repons nou pou demann ou an :';

  // Escape FIRST, then turn newlines into <br> — never the reverse.
  const bodyLines = escapeHtml(input.body).replace(/\r\n|\r|\n/g, '<br>');

  const quotedLabel = fr ? 'Ta demande' : 'Demann ou an';
  const dashboardUrl = `${SITE_URL}/${input.locale}/tableau-de-bord`;

  const bodyHtml = `
            <p style="margin:0 0 14px;">${helloHtml}</p>
            <p style="margin:0 0 18px;">${intro}</p>
            <div style="margin:0 0 20px;padding:14px 16px;border-left:3px solid ${COLORS.ochre};background-color:${COLORS.paperLight};font-size:15px;line-height:1.6;color:${COLORS.graphite};">${bodyLines}</div>
            <p style="margin:0 0 6px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted};">${quotedLabel}</p>
            <p style="margin:0;padding:10px 14px;border:1px solid ${COLORS.hairline};font-size:14px;color:${COLORS.muted};">${escapeHtml(input.ticketSubject)}</p>`;

  const preheader = fr
    ? `Réponse du support — ${input.ticketSubject}`
    : `Repons sipò a — ${input.ticketSubject}`;

  const footerNote = input.ref
    ? fr
      ? `Référence : ${input.ref} · Pour continuer cette conversation, réponds depuis ton espace.`
      : `Referans : ${input.ref} · Pou kontinye konvèsasyon an, reponn depi espas ou.`
    : fr
      ? 'Pour continuer cette conversation, réponds depuis ton espace.'
      : 'Pou kontinye konvèsasyon an, reponn depi espas ou.';

  const html = emailLayout({
    locale: input.locale,
    preheader,
    heading: fr ? 'Réponse du support' : 'Repons sipò a',
    bodyHtml,
    cta: { label: fr ? 'Ouvrir mon espace' : 'Louvri espas mwen', url: dashboardUrl },
    footerNote,
  });

  const text = [
    helloPlain,
    '',
    intro,
    '',
    input.body,
    '',
    `${quotedLabel}: ${input.ticketSubject}`,
    '',
    `${fr ? 'Mon espace' : 'Espas mwen'}: ${dashboardUrl}`,
    input.ref ? `${fr ? 'Référence' : 'Referans'}: ${input.ref}` : '',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');

  return { subject, html, text };
}

/** Admin daily-digest email (Task L5 — app/api/cron/daily-digest). Pure/
 *  testable; the cron route supplies today's already-computed counts. */
export function buildDailyDigestHtml(input: {
  locale: 'fr' | 'ht';
  dateIso: string;
  signupsToday: number;
  enrollmentsToday: number;
  revenueTodayCents: number;
  openTickets: number;
  failedWebhooks: number;
}): { subject: string; html: string; text: string } {
  const fr = input.locale === 'fr';
  const date = new Date(input.dateIso).toLocaleDateString(fr ? 'fr-FR' : 'fr-HT');
  const subject = fr ? `Résumé quotidien — ${date}` : `Rezime jodi a — ${date}`;
  const lines = fr
    ? {
        heading: 'Résumé quotidien',
        intro: `Voici le résumé de la plateforme pour le ${date} :`,
        signups: 'Nouveaux comptes',
        enrollments: 'Nouvelles inscriptions',
        revenue: 'Revenu du jour',
        tickets: 'Tickets ouverts',
        webhooks: 'Webhooks en échec',
        cta: 'Ouvrir la console admin',
      }
    : {
        heading: 'Rezime jodi a',
        intro: `Men rezime platfòm nan pou ${date} :`,
        signups: 'Nouvo kont',
        enrollments: 'Nouvo enskripsyon',
        revenue: 'Revni jodi a',
        tickets: 'Tikè ouvè',
        webhooks: 'Webhook ki echwe',
        cta: 'Ouvè konsòl admin nan',
      };

  const rows = [
    emailRow(lines.signups, String(input.signupsToday)),
    emailRow(lines.enrollments, String(input.enrollmentsToday)),
    emailRow(lines.revenue, usd(input.revenueTodayCents)),
    emailRow(lines.tickets, String(input.openTickets), { alert: input.openTickets > 0 }),
    emailRow(lines.webhooks, String(input.failedWebhooks), { alert: input.failedWebhooks > 0 }),
  ].join('');

  const bodyHtml = `
            <p style="margin:0 0 18px;">${lines.intro}</p>
            ${emailTable(rows)}`;

  const preheader = fr
    ? `${input.signupsToday} nouveaux comptes · ${usd(input.revenueTodayCents)} de revenu`
    : `${input.signupsToday} nouvo kont · ${usd(input.revenueTodayCents)} revni`;

  const adminUrl = `${SITE_URL}/${input.locale}/admin`;

  const html = emailLayout({
    locale: input.locale,
    preheader,
    heading: lines.heading,
    bodyHtml,
    cta: { label: lines.cta, url: adminUrl },
  });

  const text = [
    lines.intro,
    '',
    `${lines.signups}: ${input.signupsToday}`,
    `${lines.enrollments}: ${input.enrollmentsToday}`,
    `${lines.revenue}: ${usd(input.revenueTodayCents)}`,
    `${lines.tickets}: ${input.openTickets}`,
    `${lines.webhooks}: ${input.failedWebhooks}`,
    '',
    `${lines.cta}: ${adminUrl}`,
  ].join('\n');

  return { subject, html, text };
}
