import { getTranslations } from 'next-intl/server';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import { IconSchool } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { AvatarLink } from '@/components/auth/AvatarLink';
import { CartLink } from '@/components/cart/CartLink';
import { AdminLink } from '@/components/admin/AdminLink';
import { StudioLink } from '@/components/teacher/StudioLink';
import { clerkEnabled } from '@/lib/clerk';
import { currentUserIsApprovedTeacher } from '@/lib/teacher/profile';
import { NavClient } from '@/components/layout/NavClient';
import { NavSearch } from '@/components/layout/NavSearch';
import { getNavSearchIndex } from '@/lib/courses/nav-index';

export async function Nav() {
  const t = await getTranslations('nav');

  // The global search index (owner: « recherche pas évidente ») — resolved
  // here because images/teachers are server-only; cached 2 min, a few KB.
  // Gated + never-throws all the way down (getPublishedCourses falls back to
  // the static catalogue), so the nav can never break for it.
  const searchIndex = await getNavSearchIndex();

  // Task: studio access everywhere — resolved server-side (DB truth, no
  // Clerk metadata counterpart) and handed down to StudioLink as a plain
  // prop; see that component's header for why this isn't a client-side DB
  // call. Gated + never-throws (see currentUserIsApprovedTeacher) — this
  // must never break the nav on every page it renders on.
  const approvedTeacher = await currentUserIsApprovedTeacher();

  const links = [
    { href: '/formations' as const, label: t('formations') },
    { href: '/enseigner' as const, label: t('teach') },
    // The /pri pricing page ships next stage — the nav entry lands now
    // (Stage: the living manifest); the home triptych keeps the historic
    // /#pri anchor alive in the meantime.
    { href: '/pri' as const, label: t('pricing') },
  ];

  // Stage: the living manifest — a signed-in learner can finally reach
  // their dashboard from the nav: a mono badge next to Studio/Admin on
  // ≥sm, mirrored into the mobile menu panel via `menuExtra` (the top-bar
  // badge is sm-gated so 360px stays uncrowded).
  const dashboardBadge = (
    <Link
      href="/tableau-de-bord"
      className="hidden items-center gap-1 rounded bg-ink/[0.06] px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre sm:inline-flex"
    >
      <IconSchool size={14} />
      {t('dashboard')}
    </Link>
  );

  const authSlot = clerkEnabled ? (
    <>
      <CartLink />
      <SignedOut>
        <Link
          href="/sign-in"
          className="text-sm text-ink/75 transition-colors hover:text-ink"
        >
          {t('login')}
        </Link>
      </SignedOut>
      <SignedIn>
        {dashboardBadge}
        <StudioLink isApprovedTeacher={approvedTeacher} />
        <AdminLink />
        <AvatarLink />
      </SignedIn>
    </>
  ) : (
    <>
      <CartLink />
      <Link
        href="/sign-in"
        className="hidden text-sm text-ink/75 transition-colors hover:text-ink sm:inline"
      >
        {t('login')}
      </Link>
    </>
  );

  // The mobile-menu mirror of the dashboard entry — the panel closes on
  // route change (NavClient's pathname effect), so a plain server-rendered
  // link works here.
  const menuExtra = clerkEnabled ? (
    <SignedIn>
      <Link
        href="/tableau-de-bord"
        className="rounded px-2 py-2.5 text-[15px] text-ink/80 transition-colors hover:bg-ink/5 hover:text-ink"
      >
        {t('dashboard')}
      </Link>
    </SignedIn>
  ) : null;

  return (
    <NavClient
      links={links}
      cta={t('cta')}
      authSlot={authSlot}
      menuExtra={menuExtra}
      searchSlot={<NavSearch entries={searchIndex} variant="desktop" />}
      searchSlotMobile={<NavSearch entries={searchIndex} variant="mobile" />}
      openMenuLabel={t('openMenu')}
      closeMenuLabel={t('closeMenu')}
    />
  );
}
