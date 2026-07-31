import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { hasCap } from '@/lib/admin/guard';
import { getAdminCourse } from '@/lib/courses/write';
import { dbConfigured } from '@/lib/courses/source';
import { resolveUserId } from '@/lib/learner/access';
import { Forbidden } from '@/components/admin/Forbidden';

export const dynamic = 'force-dynamic';

/**
 * `/admin/cours/[slug]/editer` — retired as an authoring surface
 * (feat/separate-authoring): course EDITING now lives exclusively in the
 * teacher studio, even for the owner (teacher #1) — the platform admin
 * moderates/oversees (`/admin/cours`'s list + review queue, `[slug]/page.tsx`'s
 * stats, `[slug]/apercu/page.tsx`'s read-only preview) but does not author.
 *
 * Kept as a redirect (not deleted) so no old link/bookmark 404s, and it
 * still routes somewhere USEFUL depending on who's asking:
 *  - the SIGNED-IN admin owns this course (their `users.id` ===
 *    `course.ownerUserId`) → their studio editor, where authoring actually
 *    happens now.
 *  - anyone else (a moderator reviewing another teacher's course) → the
 *    admin's own read-only preview (`apercu`), which is the correct
 *    oversight surface — never someone else's authoring UI.
 */
export default async function EditCoursePage({
  params: { locale, slug },
}: {
  params: { locale: 'ht' | 'fr'; slug: string };
}) {
  setRequestLocale(locale);
  if (!(await hasCap('courses.edit'))) return <Forbidden />;

  const course = await getAdminCourse(slug);
  if (!course) notFound();

  const { userId: clerkId } = await auth();
  const signedInUserId = clerkId && dbConfigured() ? await resolveUserId(clerkId) : null;

  if (signedInUserId && course.ownerUserId === signedInUserId) {
    redirect(`/${locale}/enseigner/studio/cours/${slug}/editer`);
  }
  redirect(`/${locale}/admin/cours/${slug}/apercu`);
}
