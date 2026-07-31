/**
 * Bilingual transactional email bodies. Pure functions (no env, no fetch) so
 * they are unit-testable; sending stays in lib/email/resend.ts.
 */
import { toHtgAt, USD_TO_HTG } from '@/lib/money';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
}): { subject: string; html: string } {
  const fr = input.locale === 'fr';
  const htg = Math.round(toHtgAt(input.amountCents / 100, input.rateHtg ?? USD_TO_HTG)).toLocaleString('fr-FR');
  const date = new Date(input.dateIso).toLocaleDateString(fr ? 'fr-FR' : 'fr-HT');
  const hello = input.name
    ? (fr ? `Bonjour ${escapeHtml(input.name)},` : `Bonjou ${escapeHtml(input.name)},`)
    : (fr ? 'Bonjour,' : 'Bonjou,');
  const subject = fr
    ? `Reçu — ${input.itemName} — PNICE Academy`
    : `Resi — ${input.itemName} — PNICE Academy`;
  const lines = fr
    ? { thanks: 'Merci pour ton achat. Voici ton reçu :', item: 'Article', amount: 'Montant', date: 'Date', ref: 'Référence', foot: 'Ton accès est déjà actif dans ton tableau de bord.' }
    : { thanks: 'Mèsi pou acha w la. Men resi w :', item: 'Atik', amount: 'Montan', date: 'Dat', ref: 'Referans', foot: 'Aksè w deja aktif nan tablodbò w.' };
  const html = `
  <div style="font-family:Georgia,serif;background:#EDE6D6;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(16,32,74,.15);border-radius:12px;padding:28px">
      <h1 style="font-size:20px;color:#10204A;margin:0 0 16px">PNICE Academy</h1>
      <p style="color:#2B2B28">${hello}</p>
      <p style="color:#2B2B28">${lines.thanks}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;color:#2B2B28">
        <tr><td style="padding:6px 0;color:#8a8577">${lines.item}</td><td style="text-align:right">${escapeHtml(input.itemName)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8577">${lines.amount}</td><td style="text-align:right"><strong>${usd(input.amountCents)}</strong> (~${htg} HTG)</td></tr>
        <tr><td style="padding:6px 0;color:#8a8577">${lines.date}</td><td style="text-align:right">${date}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8577">${lines.ref}</td><td style="text-align:right;font-family:monospace;font-size:12px">${input.ref}</td></tr>
      </table>
      <p style="color:#2B2B28">${lines.foot}</p>
    </div>
  </div>`;
  return { subject, html };
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
}): { subject: string; html: string } {
  const fr = input.locale === 'fr';
  const htg = Math.round(toHtgAt(input.amountCents / 100, input.rateHtg ?? USD_TO_HTG)).toLocaleString('fr-FR');
  const hello = input.name
    ? (fr ? `Bonjour ${escapeHtml(input.name)},` : `Bonjou ${escapeHtml(input.name)},`)
    : (fr ? 'Bonjour,' : 'Bonjou,');
  const subject = fr
    ? `Ton panier t'attend — ${input.itemName}`
    : `Panye w ap tann ou — ${input.itemName}`;
  const lines = fr
    ? {
        body: `Tu as commencé un achat mais tu ne l'as pas terminé. Ton accès t'attend — reviens finaliser quand tu veux :`,
        cta: 'Reprendre mon achat',
        foot: "Une question ? Réponds simplement à cet e-mail.",
      }
    : {
        body: `Ou te kòmanse yon acha men ou pa t fini li. Aksè w ap tann ou — retounen fini lè w vle :`,
        cta: 'Kontinye acha m nan',
        foot: 'Yon kesyon? Reponn imèl sa a dirèk.',
      };
  const cta = input.resumeUrl
    ? `<p style="margin:20px 0"><a href="${escapeHtml(input.resumeUrl)}" style="display:inline-block;background:#10204A;color:#EDE6D6;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">${lines.cta}</a></p>`
    : '';
  const html = `
  <div style="font-family:Georgia,serif;background:#EDE6D6;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(16,32,74,.15);border-radius:12px;padding:28px">
      <h1 style="font-size:20px;color:#10204A;margin:0 0 16px">PNICE Academy</h1>
      <p style="color:#2B2B28">${hello}</p>
      <p style="color:#2B2B28">${lines.body}</p>
      <p style="color:#2B2B28"><strong>${escapeHtml(input.itemName)}</strong> — ${usd(input.amountCents)} (~${htg} HTG)</p>
      ${cta}
      <p style="color:#2B2B28">${lines.foot}</p>
    </div>
  </div>`;
  return { subject, html };
}

/** Admin "send a test email" button (admin/sante — health page). Pure/
 *  testable; confirms the Resend wiring (key + verified `from` domain) end to
 *  end by sending to the acting admin's own address. */
export function buildTestEmailHtml(input: { locale: 'fr' | 'ht'; adminName?: string | null }): { subject: string; html: string } {
  const fr = input.locale === 'fr';
  const hello = input.adminName
    ? (fr ? `Bonjour ${escapeHtml(input.adminName)},` : `Bonjou ${escapeHtml(input.adminName)},`)
    : (fr ? 'Bonjour,' : 'Bonjou,');
  const subject = fr ? 'Test — PNICE Academy' : 'Tès — PNICE Academy';
  const body = fr
    ? "Ceci est un email de test envoyé depuis la page Santé système de l'administration. S'il est bien arrivé dans ta boîte de réception, l'envoi via Resend fonctionne correctement."
    : 'Sa se yon imèl tès ki voye soti nan paj Sante sistèm nan (administrasyon an). Si li rive byen nan bwat resepsyon w, sa vle di anvwa Resend la ap mache byen.';
  const html = `
  <div style="font-family:Georgia,serif;background:#EDE6D6;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(16,32,74,.15);border-radius:12px;padding:28px">
      <h1 style="font-size:20px;color:#10204A;margin:0 0 16px">PNICE Academy</h1>
      <p style="color:#2B2B28">${hello}</p>
      <p style="color:#2B2B28">${body}</p>
    </div>
  </div>`;
  return { subject, html };
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
}): { subject: string; html: string } {
  const fr = input.locale === 'fr';
  const date = new Date(input.dateIso).toLocaleDateString(fr ? 'fr-FR' : 'fr-HT');
  const subject = fr ? `Résumé quotidien — ${date}` : `Rezime jodi a — ${date}`;
  const lines = fr
    ? {
        title: 'Résumé quotidien — PNICE Academy',
        signups: 'Nouveaux comptes',
        enrollments: 'Nouvelles inscriptions',
        revenue: 'Revenu du jour',
        tickets: 'Tickets ouverts',
        webhooks: 'Webhooks en échec',
      }
    : {
        title: 'Rezime jodi a — PNICE Academy',
        signups: 'Nouvo kont',
        enrollments: 'Nouvo enskripsyon',
        revenue: 'Revni jodi a',
        tickets: 'Tikè ouvè',
        webhooks: 'Webhook ki echwe',
      };
  const row = (label: string, value: string, alert = false) => `
        <tr><td style="padding:6px 0;color:#8a8577">${label}</td><td style="text-align:right${alert ? ';color:#B23A2E;font-weight:600' : ''}">${value}</td></tr>`;
  const html = `
  <div style="font-family:Georgia,serif;background:#EDE6D6;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(16,32,74,.15);border-radius:12px;padding:28px">
      <h1 style="font-size:20px;color:#10204A;margin:0 0 4px">${lines.title}</h1>
      <p style="color:#8a8577;font-size:13px;margin:0 0 16px">${date}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#2B2B28">
        ${row(lines.signups, String(input.signupsToday))}
        ${row(lines.enrollments, String(input.enrollmentsToday))}
        ${row(lines.revenue, `${usd(input.revenueTodayCents)}`)}
        ${row(lines.tickets, String(input.openTickets), input.openTickets > 0)}
        ${row(lines.webhooks, String(input.failedWebhooks), input.failedWebhooks > 0)}
      </table>
    </div>
  </div>`;
  return { subject, html };
}
