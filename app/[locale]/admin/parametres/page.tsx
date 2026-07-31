/**
 * /admin/parametres is retired (Task A1, 2026-07-30 admin restructure): it
 * used to mix site content (texts, legal pages, seats counter — now
 * /admin/contenu) with business settings (referral credit, daily digest —
 * now folded into /admin/plateforme alongside Providers/Maintenance/
 * Subscription price). Kept as a permanent redirect so no existing
 * link/bookmark 404s.
 */
import { permanentRedirect } from 'next/navigation';

export default function SettingsRedirectPage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  permanentRedirect(`/${locale}/admin/plateforme`);
}
