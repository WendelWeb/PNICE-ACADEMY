import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { hasCap } from '@/lib/admin/guard';
import { Forbidden } from '@/components/admin/Forbidden';

export const dynamic = 'force-dynamic';

/**
 * `/admin/cours/nouveau` — retired as an authoring surface
 * (feat/separate-authoring): the owner's point stands — course AUTHORING
 * belongs to the teacher studio, exactly like any other teacher (teacher #1,
 * "aucun cas spécial" — docs/superpowers/specs/2026-07-22-marketplace-design.md).
 * The platform admin only moderates/oversees now (see `/admin/cours`'s own
 * header comment). This route no longer renders a creation form — it just
 * forwards a `courses.edit`-capable admin to the studio's "new course" page,
 * which creates the course owned by THEM (the signed-in teacher), never on
 * the platform's behalf. Kept as a redirect (not deleted) so no old
 * link/bookmark 404s.
 */
export default async function NewCoursePage({ params: { locale } }: { params: { locale: 'ht' | 'fr' } }) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.edit'))) return <Forbidden />;
  redirect(`/${locale}/enseigner/studio/cours/nouveau`);
}
