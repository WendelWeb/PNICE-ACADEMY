import { setRequestLocale, getTranslations } from 'next-intl/server';
import htMessages from '@/messages/ht.json';
import frMessages from '@/messages/fr.json';
import { getPlaces, getEditableTexts, getLegal } from '@/lib/admin/site/ops';
import type { LegalSlug } from '@/lib/admin/site/store';
import { getReferralCreditCents } from '@/lib/admin/data';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';
import { PlacesConfig } from '@/components/admin/site/PlacesConfig';
import { TextsEditor } from '@/components/admin/site/TextsEditor';
import { LegalEditor } from '@/components/admin/site/LegalEditor';
import { ReferralCreditPanel } from '@/components/admin/marketing/ReferralCreditPanel';

export const dynamic = 'force-dynamic';

const LEGAL_SLUGS: LegalSlug[] = ['cgu', 'confidentialite', 'remboursement'];

export default async function SettingsPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.edit'))) return <Forbidden />;
  const t = await getTranslations('admin.settings');
  const canEditReferral = await hasCap('users.act');
  const referralCreditCents = await getReferralCreditCents();

  const places = getPlaces();
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
      <p className="text-sm text-graphite/70">{t('subtitle')}</p>
      <ReferralCreditPanel currentUsd={referralCreditCents / 100} canEdit={canEditReferral} />
      <PlacesConfig total={places.total} taken={places.taken} enabled={places.enabled} />
      <TextsEditor rows={texts} />
      <LegalEditor pages={legalPages} locale={locale} />
    </div>
  );
}
