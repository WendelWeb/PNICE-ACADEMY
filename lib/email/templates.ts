/**
 * Bilingual transactional email bodies. Pure functions (no env, no fetch) so
 * they are unit-testable; sending stays in lib/email/resend.ts.
 */
import { toHtg } from '@/lib/money';

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
}): { subject: string; html: string } {
  const fr = input.locale === 'fr';
  const htg = Math.round(toHtg(input.amountCents / 100)).toLocaleString('fr-FR');
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
