import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconTool } from '@tabler/icons-react';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';
import { RouteLine } from '@/components/layout/RouteLine';
import { getPlatform } from '@/lib/admin/platform/store';

// Dynamic so the maintenance toggle takes effect live on every public route.
// (Trade-off vs Option-B static: in production, edge config would gate this.)
export const dynamic = 'force-dynamic';

/**
 * Chrome for the PUBLIC site (marketing + learner area). The admin area is a
 * sibling route group, so it does NOT inherit this — and stays reachable when
 * maintenance mode is on (only public routes are blocked).
 */
export default async function SiteLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const maintenance = getPlatform().maintenance;
  if (maintenance.enabled) {
    const t = await getTranslations('admin.platform.maintenance');
    const message = locale === 'ht' ? maintenance.message_ht : maintenance.message_fr;
    return (
      <div className="grid min-h-screen place-items-center bg-paper px-4 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ochre/15">
            <IconTool size={30} className="text-ochre" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold text-ink">{t('publicTitle')}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-graphite/80">{message?.trim() || t('publicDefault')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="relative flex-1">
        <RouteLine />
        <div className="relative z-10">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
