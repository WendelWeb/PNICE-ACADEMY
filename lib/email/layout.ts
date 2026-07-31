/**
 * Shared, email-client-safe HTML layout — the "manifeste de cargaison"
 * identity (kraft paper, ink-navy, ochre seal) rendered as a professional
 * transactional email. Every builder in lib/email/templates.ts wraps its
 * content through `emailLayout()` so the four emails (receipt, cart
 * reminder, test email, daily digest) share one consistent, branded shell.
 *
 * Outlook-safety choices (deliberate, do not "simplify" away):
 *  - TABLE-based structure only (`role="presentation"`, cellpadding/
 *    cellspacing/border all explicit 0) — Outlook's Word rendering engine
 *    does not support flexbox/grid at all.
 *  - Every color is set INLINE on the element that needs it (background AND
 *    text color) — many clients strip <style> blocks, and this is also what
 *    keeps the email from breaking in dark mode (no reliance on the
 *    surrounding chrome to supply a background).
 *  - The <style> block that DOES exist is progressive enhancement only
 *    (mobile padding tweaks) — the table itself is already fluid
 *    (`width:100%` + `max-width:600px`) so the layout is still correct if
 *    every client strips <style> entirely.
 *  - The CTA button is the "bulletproof button" pattern: a VML rounded-rect
 *    for `mso` (Outlook desktop) wrapped in conditional comments, and an
 *    ordinary table+anchor for everything else — Outlook desktop ignores
 *    `border-radius` on HTML elements entirely, so real rounded corners
 *    there require VML.
 *  - No external images anywhere (most clients block remote images by
 *    default) — the wordmark and the seal are pure HTML/CSS.
 */

/** Canonical site origin for links inside emails that have no HTTP request
 *  in hand to derive an origin from (e.g. the Stripe webhook fulfillment
 *  path, or a cron route). Override via NEXT_PUBLIC_SITE_URL if ever needed;
 *  falls back to the production domain used elsewhere in the codebase
 *  (lib/pdf/certificate.test.ts, lib/courses/source.test.ts). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pnice.academy';

export const COLORS = {
  ink: '#10204A',
  paper: '#EDE6D6',
  paperLight: '#F2EEE4',
  ochre: '#D98E2B',
  stampred: '#B23A2E',
  teal: '#1F6E66',
  graphite: '#2B2B28',
  white: '#FFFFFF',
  muted: '#8a8577',
  hairline: 'rgba(16,32,74,.15)',
  hairlineSoft: 'rgba(16,32,74,.08)',
  footMuted: 'rgba(16,32,74,.6)',
} as const;

/** Georgia echoes the brand's editorial/document feel (headings only). */
const FONT_HEADING = `Georgia,'Times New Roman',Times,serif`;
/** Web-safe system sans stack for body copy — no webfonts. */
const FONT_BODY = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_MONO = `'Courier New',Courier,monospace`;

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escapes a URL for safe use inside an `href="…"` attribute — Stripe/DB
 *  supplied URLs can legitimately contain `&` between query params, which
 *  must be entity-encoded to `&amp;` inside an HTML attribute. */
const escapeUrl = (url: string): string => escapeHtml(url);

/**
 * The hidden "preview line" text shown next to the subject in the inbox
 * list (Gmail/Apple Mail/Outlook all read the first ~100-150 visible
 * characters of the body unless this hack is used). Padded with the
 * standard zero-width-non-joiner + non-breaking-space filler so trailing
 * visible body text is never pulled into the preview.
 */
function preheaderBlock(preheader: string): string {
  const filler = '&zwnj;&nbsp;'.repeat(40);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${COLORS.paper};">${escapeHtml(preheader)}${filler}</div>`;
}

/** Circular ochre "seal" with the brand initials, drawn in pure HTML/CSS —
 *  no image. Degrades to a square badge in clients that ignore
 *  `border-radius` (Outlook desktop) — still reads correctly. */
function sealHtml(): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="border-collapse:collapse;">
        <tr>
          <td width="44" height="44" bgcolor="${COLORS.ochre}" style="width:44px;height:44px;border-radius:50%;background-color:${COLORS.ochre};text-align:center;vertical-align:middle;line-height:44px;font-family:${FONT_HEADING};font-size:15px;font-weight:bold;color:${COLORS.ink};">PA</td>
        </tr>
      </table>`;
}

function headerHtml(): string {
  return `
    <tr>
      <td class="pnice-px" style="background-color:${COLORS.paper};padding:28px 32px 22px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td style="vertical-align:middle;">
              <span style="font-family:${FONT_HEADING};font-size:15px;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.ink};font-weight:bold;">PNICE</span>
              <span style="font-family:${FONT_MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${COLORS.muted};"> ACADEMY</span>
            </td>
            <td style="vertical-align:middle;text-align:right;width:52px;">${sealHtml()}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/**
 * A single label/value data row for use inside an `emailTable()` — the
 * receipt's item/amount/date/reference lines, the digest's counts, etc.
 * `value` may already contain inline HTML (e.g. `<strong>…</strong>`);
 * callers are responsible for escaping any user-controlled text they embed.
 */
export function emailRow(label: string, value: string, opts?: { alert?: boolean }): string {
  const alertStyle = opts?.alert ? `;color:${COLORS.stampred};font-weight:600` : '';
  return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid ${COLORS.hairlineSoft};font-family:${FONT_BODY};font-size:13px;color:${COLORS.muted};">${label}</td>
          <td style="padding:8px 0;border-bottom:1px solid ${COLORS.hairlineSoft};text-align:right;font-family:${FONT_BODY};font-size:14px;color:${COLORS.graphite}${alertStyle};">${value}</td>
        </tr>`;
}

/** Wraps a set of `emailRow()` strings in a full-width data table. */
export function emailTable(rowsHtml: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:4px 0 4px;">${rowsHtml}
      </table>`;
}

/**
 * Bulletproof CTA button: ochre background, ink text, ~44px tall (14px
 * vertical padding + line-height), touch-friendly. Real rounded corners in
 * Outlook desktop via a VML `v:roundrect` (conditional-comment gated);
 * every other client gets an ordinary table+anchor with CSS border-radius.
 */
export function emailButton(label: string, url: string): string {
  const safeUrl = escapeUrl(url);
  const safeLabel = escapeHtml(label);
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 4px;border-collapse:collapse;">
        <tr>
          <td align="center" bgcolor="${COLORS.ochre}" style="border-radius:8px;background-color:${COLORS.ochre};">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:46px;v-text-anchor:middle;width:260px;" arcsize="17%" stroke="f" fillcolor="${COLORS.ochre}">
            <w:anchorlock/>
            <center style="color:${COLORS.ink};font-family:${FONT_BODY};font-size:15px;font-weight:bold;">${safeLabel}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT_BODY};font-size:15px;font-weight:bold;line-height:18px;color:${COLORS.ink};text-decoration:none;border-radius:8px;background-color:${COLORS.ochre};">${safeLabel}</a>
            <!--<![endif]-->
          </td>
        </tr>
      </table>`;
}

function footerHtml(input: { locale: 'fr' | 'ht'; footerNote: string }): string {
  const siteLabel = 'pnice.academy';
  return `
    <tr>
      <td class="pnice-px" style="padding:22px 32px 40px;text-align:center;">
        <p style="margin:0 0 6px;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${COLORS.footMuted};">PNICE Academy</p>
        <p style="margin:0 0 6px;font-family:${FONT_BODY};font-size:12px;line-height:1.5;color:${COLORS.footMuted};">${input.footerNote}</p>
        <p style="margin:0;font-family:${FONT_BODY};font-size:12px;">
          <a href="${escapeUrl(`${SITE_URL}/${input.locale}`)}" style="color:${COLORS.teal};text-decoration:underline;">${siteLabel}</a>
        </p>
      </td>
    </tr>`;
}

const DEFAULT_FOOTER_NOTE: Record<'fr' | 'ht', string> = {
  fr: 'Tu reçois cet email parce que tu as un compte PNICE Academy.',
  ht: 'Ou resevwa imèl sa a paske ou gen yon kont PNICE Academy.',
};

export type EmailLayoutInput = {
  locale: 'fr' | 'ht';
  /** Hidden inbox-preview line — should summarize the email in ~60-100 chars. */
  preheader: string;
  /** Card heading, already locale-appropriate (e.g. "Mèsi" / "Merci"). Caller
   *  is responsible for escaping if it ever embeds user-controlled text. */
  heading: string;
  /** Pre-built inner HTML for the content card — paragraphs, an
   *  `emailTable()`, etc. Caller is responsible for escaping any
   *  user-controlled values it interpolates. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Overrides the generic default footer sentence when set. */
  footerNote?: string;
};

/**
 * Produces a COMPLETE, table-based, Outlook-safe HTML email: preheader,
 * kraft header (wordmark + ochre seal), a white content card, an optional
 * bulletproof CTA button, and a muted footer.
 */
export function emailLayout(input: EmailLayoutInput): string {
  const footerNote = input.footerNote ?? DEFAULT_FOOTER_NOTE[input.locale];
  const ctaHtml = input.cta ? emailButton(input.cta.label, input.cta.url) : '';
  return `<!doctype html>
<html lang="${input.locale}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>PNICE Academy</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>
  @media only screen and (max-width:600px) {
    .pnice-container { width:100% !important; }
    .pnice-px { padding-left:20px !important; padding-right:20px !important; }
    .pnice-card { padding:24px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.paper};">
${preheaderBlock(input.preheader)}
<center style="width:100%;background-color:${COLORS.paper};">
<!--[if mso]>
<table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td>
<![endif]-->
<table role="presentation" class="pnice-container" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;">
${headerHtml()}
  <tr>
    <td class="pnice-px" style="padding:0 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background-color:${COLORS.white};border:1px solid ${COLORS.hairline};border-radius:12px;">
        <tr>
          <td class="pnice-card" style="padding:32px;">
            <h1 style="margin:0 0 16px;font-family:${FONT_HEADING};font-size:22px;line-height:1.3;color:${COLORS.ink};">${input.heading}</h1>
            <div style="font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${COLORS.graphite};">
${input.bodyHtml}
            </div>
            ${ctaHtml ? `<div style="text-align:center;">${ctaHtml}</div>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>
${footerHtml({ locale: input.locale, footerNote })}
</table>
<!--[if mso]>
</td></tr></table>
<![endif]-->
</center>
</body>
</html>`;
}
