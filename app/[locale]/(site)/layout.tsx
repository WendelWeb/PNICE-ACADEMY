import { setRequestLocale, getTranslations } from 'next-intl/server';
import { IconTool } from '@tabler/icons-react';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';
import { RouteLine } from '@/components/layout/RouteLine';
import { UtmCapture } from '@/components/UtmCapture';
import { getPlatform } from '@/lib/admin/platform/store';
import { getFxRate } from '@/lib/fx';
import { FxRateProvider } from '@/components/ui/FxRateProvider';
import { CartProvider } from '@/components/cart/cart-context';
import { clerkEnabled } from '@/lib/clerk';

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

  // DB-backed since the durable-site-content stage (platform_settings) —
  // gated + never-throw, so no DB simply means "not in maintenance".
  const maintenance = (await getPlatform()).maintenance;
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

  // Live USD→HTG display rate (platform_settings.fx_rate_htg) — read fresh
  // on every request since this layout is force-dynamic. Provided to every
  // client price component via FxRateProvider so an admin's FX rate edit
  // (lib/admin/actions.ts's setFxRateAction) shows up here immediately,
  // without waiting on a build. GATED + NEVER-THROW (lib/fx.ts): falls back
  // to the env constant with no live DB.
  const fxRate = await getFxRate();

  return (
    <FxRateProvider rate={fxRate}>
      {/* The cart context — MOUNTED HERE, wrapping the whole public site.
          For one release this import existed without the JSX below, and
          every cart affordance silently vanished at runtime (useCart() →
          null → the add buttons rendered nothing, everywhere, for everyone).
          If you remove this wrapper, remove the cart UI with it. */}
      <CartProvider>
        <div className="flex min-h-screen flex-col">
          {clerkEnabled && <UtmCapture />}
          <Nav />
          <main className="relative flex-1">
            <RouteLine />
            <div className="relative z-10">{children}</div>
          </main>
          <Footer />
        </div>
      </CartProvider>
    </FxRateProvider>
  );
}
