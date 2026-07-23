import { getTranslations } from 'next-intl/server';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import { Link } from '@/i18n/routing';
import { AvatarLink } from '@/components/auth/AvatarLink';
import { AdminLink } from '@/components/admin/AdminLink';
import { clerkEnabled } from '@/lib/clerk';
import { NavClient } from '@/components/layout/NavClient';

export async function Nav() {
  const t = await getTranslations('nav');

  const links = [
    { href: '/formations' as const, label: t('formations') },
    { href: '/enseigner' as const, label: t('teach') },
    { href: '/#pri' as const, label: t('pricing') },
  ];

  // Unchanged from the previous nav: LangToggle/AdminLink/AvatarLink keep
  // their existing visibility — NavClient only adds mobile reach for the
  // nav links + CTA, which were already sm:-gated before this task.
  const authSlot = clerkEnabled ? (
    <>
      <SignedOut>
        <Link
          href="/sign-in"
          className="text-sm text-ink/75 transition-colors hover:text-ink"
        >
          {t('login')}
        </Link>
      </SignedOut>
      <SignedIn>
        <AdminLink />
        <AvatarLink />
      </SignedIn>
    </>
  ) : (
    <Link
      href="/sign-in"
      className="hidden text-sm text-ink/75 transition-colors hover:text-ink sm:inline"
    >
      {t('login')}
    </Link>
  );

  return (
    <NavClient
      links={links}
      cta={t('cta')}
      authSlot={authSlot}
      openMenuLabel={t('openMenu')}
      closeMenuLabel={t('closeMenu')}
    />
  );
}
