'use client';

import { useUser } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { IconChalkboard } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';

/**
 * Discreet "Estidyo / Studio" entry in the public nav (Task: studio access
 * everywhere — owner ask: "je ne vois pas comment accéder au studio prof",
 * the studio used to be linked ONLY from /enseigner and /admin/cours).
 * Mirrors components/admin/AdminLink.tsx's shape exactly, EXCEPT the gating
 * flag: an admin role lives in Clerk `publicMetadata` (readable client-side,
 * no DB call), but "has an APPROVED teacher_profiles row" is DB truth with
 * no Clerk counterpart. Rather than a client-side DB call, the caller (Nav,
 * a server component) resolves `isApprovedTeacher` once via
 * `lib/teacher/profile.ts`'s `currentUserIsApprovedTeacher()` and passes it
 * down as a plain prop — this component stays a 'use client' leaf exactly
 * like AdminLink, just fed a server-checked boolean instead of reading
 * Clerk metadata itself.
 */
export function StudioLink({ isApprovedTeacher }: { isApprovedTeacher: boolean }) {
  const { isLoaded, user } = useUser();
  const t = useTranslations('teach.studio');

  if (!isApprovedTeacher) return null;
  if (!isLoaded || !user) return null;

  return (
    <Link
      href="/enseigner/studio"
      className="inline-flex items-center gap-1 rounded bg-ink/[0.06] px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wide text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
    >
      <IconChalkboard size={14} />
      {t('navBadge')}
    </Link>
  );
}
