import { setRequestLocale } from 'next-intl/server';
import { Nav } from '@/components/layout/Nav';
import { Footer } from '@/components/layout/Footer';
import { RouteLine } from '@/components/layout/RouteLine';

/**
 * Chrome for the PUBLIC site (marketing + learner area): the cargo-manifest Nav
 * and Footer. The admin area (app/[locale]/admin) is a sibling of this route
 * group, so it deliberately does NOT inherit this chrome — it ships its own
 * internal-tool shell instead.
 */
export default function SiteLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(locale);

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
