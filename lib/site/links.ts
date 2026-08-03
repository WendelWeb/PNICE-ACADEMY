/**
 * lib/site/links.ts — pure helpers for the footer's env-driven contact
 * links (Stage: the living manifest). The footer never renders a claim it
 * can't back: a WhatsApp chip only appears when NEXT_PUBLIC_WHATSAPP_NUMBER
 * is set to something that actually looks like a phone number, and a social
 * icon only appears when its env URL parses as real http(s). Pure + unit
 * tested (lib/site/links.test.ts) — no env reads in here, the caller
 * (components/layout/Footer.tsx) passes the raw values in.
 */

/**
 * `https://wa.me/<digits>` from a raw env value, or `null` when unset/invalid.
 * Accepts the formats people actually paste — `+509 37 00 00 00`,
 * `(509) 3700-0000` — and strips everything but digits. wa.me expects the
 * full international number WITHOUT `+` or leading zeros; we only validate
 * shape (6–15 digits, per E.164's max), never the country.
 */
export function whatsAppHref(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!/^\d{6,15}$/.test(digits)) return null;
  return `https://wa.me/${digits}`;
}

/**
 * A validated http(s) URL from a raw env value, or `null` — same
 * protocol-allowlist reasoning as lib/teacher/public.ts's `isSafePhotoUrl`:
 * an env var is owner-controlled, but a typo'd `javascript:` or bare word
 * must degrade to "no link" rather than a broken/dangerous anchor.
 */
export function safeSocialUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
