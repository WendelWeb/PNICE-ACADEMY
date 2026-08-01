/**
 * Site content admin page (Task A1, 2026-07-30 admin restructure). Moved here
 * verbatim from /admin/parametres, which used to mix "site content" (texts,
 * legal pages) with "business settings" (referral credit, daily digest — now
 * on /admin/plateforme). Same cap as before (`courses.edit` — the
 * content-team role has it, matching nav.ts's `siteContent` item), same data
 * loading, same components/props: nothing here was rewritten, only relocated.
 *
 * The seats/places scarcity counter that used to live here was removed
 * (depersonalize P1): single-cohort "places limitées" theatre doesn't fit a
 * multi-teacher marketplace selling unlimited digital courses.
 */
import { setRequestLocale, getTranslations } from 'next-intl/server';
import htMessages from '@/messages/ht.json';
import frMessages from '@/messages/fr.json';
import { getEditableTexts, getLegal } from '@/lib/admin/site/ops';
import type { LegalSlug } from '@/lib/admin/site/store';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { TextsEditor } from '@/components/admin/site/TextsEditor';
import { LegalEditor } from '@/components/admin/site/LegalEditor';

export const dynamic = 'force-dynamic';

const LEGAL_SLUGS: LegalSlug[] = ['cgu', 'confidentialite', 'remboursement'];

export default async function SiteContentPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.edit'))) return <Forbidden />;
  const t = await getTranslations('admin.siteContent');

  const texts = getEditableTexts(
    htMessages as unknown as Record<string, unknown>,
    frMessages as unknown as Record<string, unknown>,
  );
  const legalPages = LEGAL_SLUGS.map((slug) => {
    const p = getLegal(slug)!;
    const cur = p.versions[0];
    return { slug, content_ht: cur.content_ht, content_fr: cur.content_fr, versions: p.versions };
  });

  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/45">{t('title')}</p>
        <p className="mt-1 text-sm text-graphite/70">{t('intro')}</p>
      </div>
      <TextsEditor rows={texts} />
      <LegalEditor pages={legalPages} locale={locale} />
    </div>
  );
}
