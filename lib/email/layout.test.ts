import { describe, it, expect } from 'vitest';
import { emailLayout, emailButton, emailRow, emailTable, escapeHtml, SITE_URL } from '@/lib/email/layout';

describe('emailLayout', () => {
  const base = { locale: 'fr' as const, preheader: 'Aperçu du courriel', heading: 'Titre', bodyHtml: '<p>Corps</p>' };

  it('includes the hidden preheader text', () => {
    const html = emailLayout(base);
    expect(html).toContain('Aperçu du courriel');
    // Hidden via the standard display:none + max-height:0 + overflow hack.
    expect(html).toContain('display:none');
    expect(html).toContain('max-height:0');
  });

  it('renders a table-based structure, not flexbox/grid', () => {
    const html = emailLayout(base);
    expect(html).toContain('role="presentation"');
    expect(html).toContain('cellpadding="0"');
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('display:grid');
  });

  it('renders the CTA button when provided, with a bulletproof VML fallback for Outlook', () => {
    const html = emailLayout({ ...base, cta: { label: 'Continuer', url: 'https://pnice.academy/fr/checkout' } });
    expect(html).toContain('Continuer');
    expect(html).toContain('href="https://pnice.academy/fr/checkout"');
    expect(html).toContain('v:roundrect'); // Outlook desktop VML rounded-rect
    expect(html).toContain('[if mso]');
  });

  it('renders no CTA button when omitted', () => {
    const html = emailLayout(base);
    expect(html).not.toContain('v:roundrect');
  });

  it('includes the ochre seal with brand initials and no external images', () => {
    const html = emailLayout(base);
    expect(html).toContain('>PA<');
    expect(html).not.toContain('<img');
  });

  it('sets explicit background + text color on every major block (dark-mode safe)', () => {
    const html = emailLayout(base);
    expect(html).toContain('background-color:#EDE6D6'); // header/body kraft
    expect(html).toContain('background-color:#FFFFFF'); // content card
    expect(html).toContain('color:#10204A'); // ink heading
    expect(html).toContain('color:#2B2B28'); // graphite body
  });

  it('links the footer to the site under the given locale', () => {
    const htmlFr = emailLayout({ ...base, locale: 'fr' });
    const htmlHt = emailLayout({ ...base, locale: 'ht' });
    expect(htmlFr).toContain(`href="${SITE_URL}/fr"`);
    expect(htmlHt).toContain(`href="${SITE_URL}/ht"`);
  });

  it('uses a default bilingual footer note unless overridden', () => {
    const fr = emailLayout(base);
    const ht = emailLayout({ ...base, locale: 'ht' });
    expect(fr).toContain('Tu reçois cet email');
    expect(ht).toContain('Ou resevwa imèl sa a');
    const overridden = emailLayout({ ...base, footerNote: 'Note personnalisée' });
    expect(overridden).toContain('Note personnalisée');
    expect(overridden).not.toContain('Tu reçois cet email');
  });
});

describe('emailButton', () => {
  it('escapes the label and URL', () => {
    const html = emailButton('<b>Go</b>', 'https://x.test/?a=1&b=2');
    expect(html).not.toContain('<b>Go</b>');
    expect(html).toContain('&lt;b&gt;Go&lt;/b&gt;');
    expect(html).toContain('href="https://x.test/?a=1&amp;b=2"');
  });
});

describe('emailRow / emailTable', () => {
  it('renders a label/value row, optionally flagged as an alert', () => {
    const normal = emailRow('Label', 'Value');
    expect(normal).toContain('>Label<');
    expect(normal).toContain('>Value<');
    expect(normal).not.toContain('#B23A2E');

    const alert = emailRow('Label', '2', { alert: true });
    expect(alert).toContain('#B23A2E');
  });

  it('wraps rows in a table', () => {
    const table = emailTable(emailRow('A', 'B'));
    expect(table).toContain('<table');
    expect(table).toContain('>A<');
  });
});

describe('escapeHtml', () => {
  it('escapes <, >, &, and "', () => {
    expect(escapeHtml('<script>alert("x")</script> & co')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co',
    );
  });
});
