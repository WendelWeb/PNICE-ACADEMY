/**
 * Resend email helper (Phase D Lot 3). Uses the Resend REST API via `fetch` — no
 * SDK dependency. Env-gated: with no `RESEND_API_KEY` it is a safe no-op that
 * reports `skipped`, so every caller can `await sendEmail(...)` unconditionally
 * and the platform keeps working before email is wired.
 *
 * SECURITY: the API key is read from env at call time and never returned/logged.
 */

export type SendEmailResult = { sent: boolean; skipped: boolean; id?: string; error?: string };

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  /** Defaults to RESEND_FROM, then a sensible PNICE Academy sender. */
  from?: string;
  replyTo?: string;
};

/**
 * Live only with a key AND real recipients. In mock mode the learner emails are
 * fabricated (…@gmail.com), so we must NEVER actually send to them — sending is
 * gated on the real data source (or an explicit EMAIL_LIVE=true override for
 * testing to a known address).
 */
function emailLive(): boolean {
  return process.env.ADMIN_DATA_SOURCE === 'real' || process.env.EMAIL_LIVE === 'true';
}

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && emailLive();
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // No-op until email is wired. Visible in server logs, never throws.
    console.info(`[email:skipped] "${input.subject}" → ${Array.isArray(input.to) ? input.to.join(', ') : input.to}`);
    return { sent: false, skipped: true };
  }
  if (!emailLive()) {
    // Key present but data is mock (fake recipient addresses) → never send.
    console.info(`[email:skipped-mock] "${input.subject}" (set ADMIN_DATA_SOURCE=real or EMAIL_LIVE=true to send)`);
    return { sent: false, skipped: true };
  }
  const from = input.from ?? process.env.RESEND_FROM ?? 'PNICE Academy <no-reply@pnice.academy>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, skipped: false, error: `HTTP ${res.status}${body ? ` — ${body.slice(0, 160)}` : ''}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, skipped: false, id: data.id };
  } catch (e) {
    return { sent: false, skipped: false, error: e instanceof Error ? e.message : 'error' };
  }
}
