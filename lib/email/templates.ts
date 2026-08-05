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

/* -------------------------------------------------------------------------- */
/* Stage 6 — the complete transactional email loop.                           */
/*                                                                            */
/* Every builder below goes through `composeEmail()` — one private composer   */
/* that escapes EVERY interpolated value (names, notes, titles, references    */
/* are all user- or teacher-chosen text), wraps the result in `emailLayout()` */
/* and derives the plain-text alternative from the same content, so a new     */
/* email can never accidentally ship unescaped markup or forget its text      */
/* part. Builders stay pure (no env, no fetch, no DB) — sending and lookups   */
/* live at the choke points (fulfill.ts, webhooks, admin/teacher actions).    */
/* -------------------------------------------------------------------------- */

type BuiltEmail = { subject: string; html: string; text: string };

type ComposeInput = {
  locale: 'fr' | 'ht';
  subject: string;
  preheader: string;
  heading: string;
  /** Recipient display name for the "Bonjou X," line (null ⇒ generic). */
  name?: string | null;
  /** Set false for recipient-less/system emails (none today, but explicit). */
  greet?: boolean;
  /** Plain-text paragraphs — escaped into HTML, verbatim in the text part. */
  paragraphs: string[];
  /** Label → plain-text value rows, rendered as an `emailTable` (escaped). */
  rows?: [string, string][];
  /** Bordered quoted block (review note, ticket subject…) — escaped, with
   *  newlines preserved as <br> (escape FIRST, then newline→<br>). */
  quote?: { label: string; body: string };
  cta?: { label: string; url: string };
  footerNote?: string;
};

function composeEmail(input: ComposeInput): BuiltEmail {
  const fr = input.locale === 'fr';
  const greet = input.greet ?? true;

  const parts: string[] = [];
  if (greet) {
    parts.push(`<p style="margin:0 0 14px;">${helloLine(input.name ?? null, fr, escapeHtml)}</p>`);
  }
  for (const p of input.paragraphs) {
    parts.push(`<p style="margin:0 0 16px;">${escapeHtml(p)}</p>`);
  }
  if (input.rows && input.rows.length > 0) {
    parts.push(emailTable(input.rows.map(([label, value]) => emailRow(escapeHtml(label), escapeHtml(value))).join('')));
  }
  if (input.quote) {
    // Escape FIRST, then turn newlines into <br> — never the reverse
    // (same rule as buildSupportReplyHtml above).
    const quoted = escapeHtml(input.quote.body).replace(/\r\n|\r|\n/g, '<br>');
    parts.push(
      `<p style="margin:16px 0 6px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted};">${escapeHtml(input.quote.label)}</p>`,
    );
    parts.push(
      `<div style="margin:0 0 4px;padding:14px 16px;border-left:3px solid ${COLORS.ochre};background-color:${COLORS.paperLight};font-size:15px;line-height:1.6;color:${COLORS.graphite};">${quoted}</div>`,
    );
  }

  const html = emailLayout({
    locale: input.locale,
    preheader: input.preheader,
    heading: input.heading,
    bodyHtml: `\n            ${parts.join('\n            ')}`,
    cta: input.cta,
    footerNote: input.footerNote,
  });

  const textLines: string[] = [];
  if (greet) textLines.push(helloLine(input.name ?? null, fr, (s) => s), '');
  for (const p of input.paragraphs) textLines.push(p, '');
  if (input.rows) for (const [label, value] of input.rows) textLines.push(`${label}: ${value}`);
  if (input.rows && input.rows.length > 0) textLines.push('');
  if (input.quote) textLines.push(`${input.quote.label}: ${input.quote.body}`, '');
  if (input.cta) textLines.push(`${input.cta.label}: ${input.cta.url}`, '');
  textLines.push('--', 'PNICE Academy');
  const text = textLines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');

  return { subject: input.subject, html, text };
}

/** 'YYYY-MM' → a human month label ('jiyè 2026' / 'juillet 2026'). Kreyòl
 *  month names are spelled out (no Intl locale exists for ht); French goes
 *  through Intl. A malformed period echoes back unchanged — never throws. */
const HT_MONTHS = ['janvye', 'fevriye', 'mas', 'avril', 'me', 'jen', 'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm'];
export function monthLabel(period: string, locale: 'fr' | 'ht'): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return period;
  if (locale === 'ht') return `${HT_MONTHS[idx]} ${m[1]}`;
  return new Date(Date.UTC(Number(m[1]), idx, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Learner welcome — Clerk `user.created` webhook. A brand-new account has
 *  no locale preference yet, so the caller defaults to 'ht' (platform
 *  default). */
export function buildWelcomeHtml(input: { locale: 'fr' | 'ht'; name: string | null }): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? 'Bienvenue sur PNICE Academy' : 'Byenveni sou PNICE Academy',
    preheader: fr
      ? 'Ton compte est prêt — découvre les formations'
      : 'Kont ou pare — dekouvri kou yo',
    heading: fr ? 'Bienvenue !' : 'Byenveni!',
    paragraphs: fr
      ? [
          'Ton compte est prêt. Sur PNICE Academy, tu trouveras des formations en créole et en français, créées par des enseignants haïtiens.',
          'Choisis une formation, apprends sur ton téléphone et reçois un certificat à la fin.',
        ]
      : [
          'Kont ou pare. Sou PNICE Academy w ap jwenn kou an kreyòl ak an franse, ki fèt pa anseyan ayisyen.',
          'Chwazi yon kou, aprann sou telefòn ou, epi jwenn yon sètifika lè ou fini.',
        ],
    cta: {
      label: fr ? 'Découvrir les formations' : 'Dekouvri kou yo',
      url: `${SITE_URL}/${input.locale}/formations`,
    },
    footerNote: fr ? 'Une question ? Réponds simplement à cet e-mail.' : 'Yon kesyon? Reponn imèl sa a dirèk.',
  });
}

/** Certificate earned — sent at issuance (lib/learner/progress-actions.ts),
 *  with the verification code + public verify link. */
export function buildCertificateEarnedHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  courseTitle: string;
  code: string;
  verifyUrl: string;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? `Ton certificat est prêt — ${input.courseTitle}` : `Sètifika ou pare — ${input.courseTitle}`,
    preheader: fr
      ? `Tu as terminé « ${input.courseTitle} » — ton certificat est prêt`
      : `Ou fini « ${input.courseTitle} » — sètifika ou pare`,
    heading: fr ? 'Félicitations !' : 'Felisitasyon!',
    paragraphs: fr
      ? ['Tu as terminé la formation — beau travail ! Ton certificat est prêt.']
      : ['Ou fini kou a nèt — bèl travay! Sètifika ou pare.'],
    rows: fr
      ? [
          ['Formation', input.courseTitle],
          ['Code de vérification', input.code],
        ]
      : [
          ['Kou', input.courseTitle],
          ['Kòd verifikasyon', input.code],
        ],
    cta: { label: fr ? 'Voir mon certificat' : 'Gade sètifika m nan', url: input.verifyUrl },
    footerNote: fr
      ? "N'importe qui peut vérifier ce certificat avec le code ci-dessus."
      : 'Nenpòt moun ka verifye sètifika a ak kòd ki anwo a.',
  });
}

/** Payment-failed dunning to the LEARNER (invoice.payment_failed used to
 *  only ring the admin bell — silent lockout). Links the /kont abonman tab. */
export function buildPaymentFailedHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  /** Defaults to the /kont subscription tab on the canonical site origin. */
  manageUrl?: string | null;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  const manageUrl = input.manageUrl ?? `${SITE_URL}/${input.locale}/kont?tab=subscription`;
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? 'Le paiement n’est pas passé — mets ta carte à jour' : 'Peman an pa pase — mete kat ou ajou',
    preheader: fr
      ? 'Le renouvellement de ton abonnement a échoué — mets ta carte à jour pour garder ton accès'
      : 'Renouvèlman abònman ou an pa pase — mete kat ou ajou pou kenbe aksè w',
    heading: fr ? 'Le paiement n’est pas passé' : 'Peman an pa pase',
    paragraphs: fr
      ? [
          'Nous n’avons pas pu prélever le renouvellement de ton abonnement. Pas d’inquiétude — ton accès n’est pas encore coupé.',
          'Mets ta carte à jour pour garder ton accès. Sans action de ta part, l’abonnement finira par s’arrêter.',
        ]
      : [
          'Nou pa t rive pran peman renouvèlman abònman ou an. Pa enkyete w — aksè ou poko fèmen.',
          'Mete kat ou ajou pou kenbe aksè a. Si ou pa fè anyen, abònman an ap fini pa kanpe.',
        ],
    cta: { label: fr ? 'Mettre ma carte à jour' : 'Mete kat mwen ajou', url: manageUrl },
    footerNote: fr ? 'Une question ? Réponds simplement à cet e-mail.' : 'Yon kesyon? Reponn imèl sa a dirèk.',
  });
}

/** Refund confirmation — charge.refunded used to flip access silently. */
export function buildRefundConfirmationHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  itemName: string;
  amountCents: number;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? `Ton remboursement est confirmé — ${input.itemName}` : `Ranbousman ou konfime — ${input.itemName}`,
    preheader: fr
      ? `Remboursement de ${usd(input.amountCents)} confirmé`
      : `Ranbousman ${usd(input.amountCents)} lan konfime`,
    heading: fr ? 'Remboursement confirmé' : 'Ranbousman konfime',
    paragraphs: fr
      ? ['Nous avons remboursé cet achat. Le montant reviendra sur ta carte d’ici quelques jours, selon ta banque.']
      : ['Nou ranbouse acha sa a. Lajan an ap tounen sou kat ou nan kèk jou, dapre bank ou.'],
    rows: fr
      ? [
          ['Article', input.itemName],
          ['Montant', usd(input.amountCents)],
        ]
      : [
          ['Atik', input.itemName],
          ['Montan', usd(input.amountCents)],
        ],
    footerNote: fr
      ? 'L’accès lié à cet achat est terminé. Une question ? Réponds à cet e-mail.'
      : 'Aksè ki te mache ak acha sa a fèmen. Yon kesyon? Reponn imèl sa a.',
  });
}

/** Ticket-received confirmation — sent right after a learner/visitor files a
 *  support ticket (/kont support tab, /kontak form). */
export function buildTicketReceivedHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  ticketSubject: string;
  ref?: string | null;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  const footerNote = input.ref
    ? fr
      ? `Référence : ${input.ref} · Nous te répondrons par e-mail.`
      : `Referans : ${input.ref} · N ap reponn ou pa imèl.`
    : undefined;
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? 'Nous avons bien reçu ton message — PNICE Academy' : 'Nou resevwa mesaj ou — PNICE Academy',
    preheader: fr
      ? 'Ton message est arrivé — nous te répondrons dès que possible'
      : 'Mesaj ou rive — n ap reponn ou pi vit nou kapab',
    heading: fr ? 'Message bien reçu' : 'Nou resevwa mesaj ou',
    paragraphs: fr
      ? ['Merci — ton message est bien arrivé à l’équipe. Nous te répondrons par e-mail dès que possible.']
      : ['Mèsi — mesaj ou rive jwenn ekip la. N ap reponn ou pa imèl pi vit nou kapab.'],
    quote: { label: fr ? 'Ton message' : 'Mesaj ou', body: input.ticketSubject },
    footerNote,
  });
}

/** Teacher application received — right after `applyAsTeacherAction`. */
export function buildTeacherApplicationReceivedHtml(input: { locale: 'fr' | 'ht'; name: string | null }): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? 'Nous avons bien reçu ta candidature — PNICE Academy' : 'Nou resevwa aplikasyon w — PNICE Academy',
    preheader: fr
      ? 'Ta candidature d’enseignant est en cours d’examen'
      : 'Aplikasyon anseyan w lan ap revize',
    heading: fr ? 'Candidature reçue' : 'Aplikasyon w rive',
    paragraphs: fr
      ? [
          'Merci de vouloir enseigner sur PNICE Academy. L’équipe examine ta candidature.',
          'Nous t’écrirons dès qu’elle sera passée en revue.',
        ]
      : [
          'Mèsi paske ou vle anseye sou PNICE Academy. Ekip la ap gade aplikasyon w.',
          'N ap voye yon imèl ba ou kou nou fin revize li.',
        ],
  });
}

/** Teacher application approved — 'Ou ka kòmanse kreye kou'. */
export function buildTeacherApprovedHtml(input: { locale: 'fr' | 'ht'; name: string | null }): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr
      ? 'Tu es approuvé — tu peux commencer à créer des cours'
      : 'Ou apwouve — ou ka kòmanse kreye kou',
    preheader: fr
      ? 'Ta candidature est approuvée — ouvre ton studio'
      : 'Aplikasyon w apwouve — louvri studio ou',
    heading: fr ? 'Approuvé !' : 'Ou apwouve!',
    paragraphs: fr
      ? [
          'Bonne nouvelle — ta candidature est approuvée. Tu peux commencer à créer des cours dès maintenant.',
          'Ouvre ton studio pour créer ta première formation, fixer ton prix et la soumettre.',
        ]
      : [
          'Bòn nouvèl — aplikasyon w apwouve. Ou ka kòmanse kreye kou depi kounye a.',
          'Louvri studio ou pou kreye premye kou ou, mete pri ou, epi soumèt li.',
        ],
    cta: { label: fr ? 'Ouvrir mon studio' : 'Louvri studio mwen', url: `${SITE_URL}/${input.locale}/enseigner/studio` },
  });
}

/** Teacher application rejected — carries the admin's reviewNote, respectful
 *  tone, and says re-applying is open (it is: `applyAsTeacherAction` accepts
 *  a 'rejected' profile re-applying). */
export function buildTeacherRejectedHtml(input: { locale: 'fr' | 'ht'; name: string | null; note: string }): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? 'Réponse sur ta candidature — PNICE Academy' : 'Repons sou aplikasyon w — PNICE Academy',
    preheader: fr
      ? 'Ta candidature a été examinée — voici la réponse de l’équipe'
      : 'Ekip la revize aplikasyon w — men repons lan',
    heading: fr ? 'Ta candidature' : 'Aplikasyon w',
    paragraphs: fr
      ? ['Merci pour ta candidature. Cette fois-ci, nous ne pouvons pas l’approuver.']
      : ['Mèsi pou aplikasyon w. Fwa sa a, nou pa ka apwouve li.'],
    quote: { label: fr ? 'Note de l’équipe' : 'Nòt ekip la', body: input.note },
    footerNote: fr
      ? 'Tu peux corriger ce qui est indiqué et repostuler quand tu es prêt — nous la relirons avec plaisir.'
      : 'Ou ka korije sa ki endike a epi aplike ankò lè ou pare — n ap kontan gade li ankò.',
  });
}

/** Course approved — the public link, to the course owner. */
export function buildCourseApprovedHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  courseTitle: string;
  publicUrl: string;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? `Ta formation est publiée — ${input.courseTitle}` : `Kou ou a pibliye — ${input.courseTitle}`,
    preheader: fr
      ? `« ${input.courseTitle} » est maintenant visible par tout le monde`
      : `« ${input.courseTitle} » vizib pou tout moun kounye a`,
    heading: fr ? 'Formation publiée !' : 'Kou ou a pibliye!',
    paragraphs: fr
      ? ['Bonne nouvelle — l’équipe a approuvé ta formation. Elle est maintenant visible par tout le monde.']
      : ['Bòn nouvèl — ekip la apwouve kou ou a. Li vizib pou tout moun kounye a.'],
    rows: [[fr ? 'Formation' : 'Kou', input.courseTitle]],
    cta: { label: fr ? 'Voir la page publique' : 'Gade paj piblik la', url: input.publicUrl },
  });
}

/** Course rejected — the reviewNote + a link straight to the studio editor. */
export function buildCourseRejectedHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  courseTitle: string;
  note: string;
  editUrl: string;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr
      ? `Ta formation demande des changements — ${input.courseTitle}`
      : `Kou ou a bezwen chanjman — ${input.courseTitle}`,
    preheader: fr
      ? 'L’équipe a relu ta formation — quelques changements avant publication'
      : 'Ekip la revize kou ou a — kèk chanjman anvan li pibliye',
    heading: fr ? 'Quelques changements à faire' : 'Kèk chanjman pou fè',
    paragraphs: fr
      ? [`L’équipe a relu « ${input.courseTitle} ». Avant de la publier, il y a quelques points à corriger.`]
      : [`Ekip la gade « ${input.courseTitle} ». Anvan li pibliye, gen kèk bagay pou korije.`],
    quote: { label: fr ? 'Note de l’équipe' : 'Nòt ekip la', body: input.note },
    cta: { label: fr ? 'Modifier la formation' : 'Modifye kou a', url: input.editUrl },
    footerNote: fr
      ? 'Fais les changements puis soumets à nouveau — nous la relirons vite.'
      : 'Fè chanjman yo epi soumèt kou a ankò — n ap revize li vit.',
  });
}

/** Sale notification to the TEACHER — 'Ou fè yon vant — {item}, +$X (70%)'.
 *  `netPct` is the teacher's real share (100 − frozen commission pct). */
export function buildTeacherSaleHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  itemName: string;
  netCents: number;
  netPct: number;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? `Tu as fait une vente — ${input.itemName}` : `Ou fè yon vant — ${input.itemName}`,
    preheader: fr
      ? `${input.itemName} — +${usd(input.netCents)} (${input.netPct} %) sur ton solde`
      : `${input.itemName} — +${usd(input.netCents)} (${input.netPct}%) sou balans ou`,
    heading: fr ? 'Tu as fait une vente !' : 'Ou fè yon vant!',
    paragraphs: fr
      ? ['Bonne nouvelle — quelqu’un vient d’acheter chez toi sur PNICE Academy.']
      : ['Bòn nouvèl — yon moun fèk achte nan men ou sou PNICE Academy.'],
    rows: fr
      ? [
          ['Article', input.itemName],
          [`Ta part (${input.netPct} %)`, `+${usd(input.netCents)}`],
        ]
      : [
          ['Atik', input.itemName],
          [`Pa ou (${input.netPct}%)`, `+${usd(input.netCents)}`],
        ],
    cta: { label: fr ? 'Ouvrir mon studio' : 'Louvri studio mwen', url: `${SITE_URL}/${input.locale}/enseigner/studio` },
    footerNote: fr ? 'Le montant est déjà ajouté à ton solde.' : 'Montan an deja ajoute nan balans ou.',
  });
}

/** Payout requested — confirmation to the teacher. */
export function buildPayoutRequestedHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  amountCents: number;
  method?: string | null;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  const rows: [string, string][] = [[fr ? 'Montant' : 'Montan', usd(input.amountCents)]];
  if (input.method) rows.push([fr ? 'Méthode' : 'Metòd', input.method]);
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? 'Nous avons bien reçu ta demande de retrait' : 'Nou resevwa demann retrè w',
    preheader: fr
      ? `Demande de retrait de ${usd(input.amountCents)} reçue`
      : `Demann retrè ${usd(input.amountCents)} lan rive`,
    heading: fr ? 'Demande de retrait reçue' : 'Demann retrè w rive',
    paragraphs: fr
      ? ['Nous avons bien reçu ta demande de retrait. L’équipe la traite, et tu recevras un e-mail dès que le paiement part.']
      : ['Nou resevwa demann retrè w. Ekip la ap trete li, epi w ap resevwa yon imèl kou peman an soti.'],
    rows,
  });
}

/** Payout paid — with the payment reference. */
export function buildPayoutPaidHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  amountCents: number;
  reference: string;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? 'Ton retrait est payé' : 'Retrè w peye',
    preheader: fr
      ? `${usd(input.amountCents)} envoyés — référence ${input.reference}`
      : `${usd(input.amountCents)} soti — referans ${input.reference}`,
    heading: fr ? 'Retrait payé' : 'Retrè w peye',
    paragraphs: fr
      ? ['Nous venons d’envoyer ton retrait. Voici les détails :']
      : ['Nou fèk voye lajan retrè w la. Men detay yo :'],
    rows: fr
      ? [
          ['Montant', usd(input.amountCents)],
          ['Référence', input.reference],
        ]
      : [
          ['Montan', usd(input.amountCents)],
          ['Referans', input.reference],
        ],
    footerNote: fr
      ? 'Si tu ne vois pas le montant d’ici quelques jours, réponds à cet e-mail.'
      : 'Si ou pa wè lajan an nan kèk jou, reponn imèl sa a.',
  });
}

/** Payout rejected — with the admin's note; the balance is untouched. */
export function buildPayoutRejectedHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  amountCents: number;
  note: string;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? 'Ta demande de retrait n’est pas passée' : 'Demann retrè w pa pase',
    preheader: fr
      ? `Demande de ${usd(input.amountCents)} refusée — ton solde n’a pas bougé`
      : `Demann ${usd(input.amountCents)} lan pa pase — balans ou pa chanje`,
    heading: fr ? 'Ta demande de retrait' : 'Demann retrè w',
    paragraphs: fr
      ? ['Nous n’avons pas pu traiter cette demande de retrait.']
      : ['Nou pa t ka trete demann retrè sa a.'],
    rows: [[fr ? 'Montant' : 'Montan', usd(input.amountCents)]],
    quote: { label: fr ? 'Note de l’équipe' : 'Nòt ekip la', body: input.note },
    footerNote: fr
      ? 'Ton solde n’a pas bougé — corrige ce qui est indiqué puis refais une demande.'
      : 'Balans ou pa chanje — korije sa ki endike a epi fè yon lòt demann.',
  });
}

/** Monthly Pass-PNICE split credited — 'Pass PNICE — {month}: +$X'. */
export function buildPlatformPassSplitHtml(input: {
  locale: 'fr' | 'ht';
  name: string | null;
  /** 'YYYY-MM' */
  period: string;
  amountCents: number;
}): BuiltEmail {
  const fr = input.locale === 'fr';
  const month = monthLabel(input.period, input.locale);
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr
      ? `Pass PNICE — ${month} : +${usd(input.amountCents)}`
      : `Pass PNICE — ${month}: +${usd(input.amountCents)}`,
    preheader: fr
      ? `Ta part du Pass PNICE pour ${month} est créditée`
      : `Pati pa w nan Pass PNICE pou ${month} kredite`,
    heading: fr ? 'Ta part du Pass PNICE' : 'Pati pa w nan Pass PNICE',
    paragraphs: fr
      ? [`En ${month}, des élèves avec le Pass PNICE ont suivi tes cours. Voici ta part des abonnements du mois :`]
      : [`Nan mwa ${month} lan, elèv ki gen Pass PNICE swiv kou pa ou yo. Men pati pa w nan abònman mwa a :`],
    rows: fr
      ? [
          ['Mois', month],
          ['Montant', `+${usd(input.amountCents)}`],
        ]
      : [
          ['Mwa', month],
          ['Montan', `+${usd(input.amountCents)}`],
        ],
    cta: { label: fr ? 'Ouvrir mon studio' : 'Louvri studio mwen', url: `${SITE_URL}/${input.locale}/enseigner/studio` },
    footerNote: fr ? 'Le montant est déjà ajouté à ton solde.' : 'Montan an deja ajoute nan balans ou.',
  });
}

/** "Stuck learner" nudge — the admin-triggered engagement reminder, rebuilt
 *  on the branded layout (was raw inline HTML in lib/admin/actions.ts). */
export function buildEngagementReminderHtml(input: { locale: 'fr' | 'ht'; name: string | null }): BuiltEmail {
  const fr = input.locale === 'fr';
  return composeEmail({
    locale: input.locale,
    name: input.name,
    subject: fr ? 'Continue ta formation — PNICE Academy' : 'Kontinye fòmasyon ou — PNICE Academy',
    preheader: fr
      ? 'Ta formation t’attend — reviens quand tu veux'
      : 'Fòmasyon ou ap tann ou — tounen lè ou vle',
    heading: fr ? 'On t’attend' : 'N ap tann ou',
    paragraphs: fr
      ? ['Nous avons vu que tu as commencé une formation sans la terminer. Reviens continuer quand tu es prêt — on t’attend !']
      : ['Nou wè ou te kòmanse yon fòmasyon men ou poko fini. Tounen kontinye lè ou pare — n ap tann ou!'],
    cta: { label: fr ? 'Continuer à apprendre' : 'Kontinye aprann', url: `${SITE_URL}/${input.locale}/tableau-de-bord` },
  });
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
  /** Stage 7 — the three moderation-queue counts (optional/additive: default
   *  0 so pre-existing callers/tests that omit them keep working unchanged). */
  pendingApplications?: number;
  pendingCourseReviews?: number;
  pendingWithdrawals?: number;
}): { subject: string; html: string; text: string } {
  const fr = input.locale === 'fr';
  const date = new Date(input.dateIso).toLocaleDateString(fr ? 'fr-FR' : 'fr-HT');
  const subject = fr ? `Résumé quotidien — ${date}` : `Rezime jodi a — ${date}`;
  const pendingApplications = input.pendingApplications ?? 0;
  const pendingCourseReviews = input.pendingCourseReviews ?? 0;
  const pendingWithdrawals = input.pendingWithdrawals ?? 0;
  const lines = fr
    ? {
        heading: 'Résumé quotidien',
        intro: `Voici le résumé de la plateforme pour le ${date} :`,
        signups: 'Nouveaux comptes',
        enrollments: 'Nouvelles inscriptions',
        revenue: 'Revenu du jour',
        tickets: 'Tickets ouverts',
        webhooks: 'Webhooks en échec',
        applications: 'Candidatures enseignant en attente',
        courseReviews: 'Cours à valider',
        withdrawals: 'Retraits en attente',
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
        applications: 'Kandidati anseyan k ap tann',
        courseReviews: 'Kou pou revize',
        withdrawals: 'Retrè k ap tann',
        cta: 'Ouvè konsòl admin nan',
      };

  const rows = [
    emailRow(lines.signups, String(input.signupsToday)),
    emailRow(lines.enrollments, String(input.enrollmentsToday)),
    emailRow(lines.revenue, usd(input.revenueTodayCents)),
    emailRow(lines.tickets, String(input.openTickets), { alert: input.openTickets > 0 }),
    emailRow(lines.webhooks, String(input.failedWebhooks), { alert: input.failedWebhooks > 0 }),
    emailRow(lines.applications, String(pendingApplications), { alert: pendingApplications > 0 }),
    emailRow(lines.courseReviews, String(pendingCourseReviews), { alert: pendingCourseReviews > 0 }),
    emailRow(lines.withdrawals, String(pendingWithdrawals), { alert: pendingWithdrawals > 0 }),
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
    `${lines.applications}: ${pendingApplications}`,
    `${lines.courseReviews}: ${pendingCourseReviews}`,
    `${lines.withdrawals}: ${pendingWithdrawals}`,
    '',
    `${lines.cta}: ${adminUrl}`,
  ].join('\n');

  return { subject, html, text };
}
