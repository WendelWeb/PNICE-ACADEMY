'use client';

import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

/** The nav avatar — routes to our own /kont page (no Clerk popover). */
export function AvatarLink() {
  const { user } = useUser();
  const t = useTranslations('kont');
  const initial = (user?.firstName || user?.username || '?')
    .slice(0, 1)
    .toUpperCase();

  return (
    <Link
      href="/kont"
      aria-label={t('title')}
      className="block rounded-full transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
    >
      {user?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.imageUrl}
          alt=""
          className="h-8 w-8 rounded-full border border-ink/15 object-cover"
        />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper-light">
          {initial}
        </span>
      )}
    </Link>
  );
}
