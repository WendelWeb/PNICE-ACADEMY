/**
 * GET /api/me/courses — the signed-in learner's accessible course slugs
 * (enrollments + whatever their active pass covers), for CLIENT surfaces
 * that live in shared caches and therefore can't know the viewer
 * server-side — the catalogue/home cards (owner: « j'ai déjà acheté,
 * pourquoi Achte sur les cartes »).
 *
 * Deliberately tiny and boring: reuses getMyLearning (the dashboard's own
 * resolver, gated + never-throws), returns only slugs, and is `private,
 * no-store` — this is per-person data riding next to cached pages.
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { clerkEnabled } from '@/lib/clerk';
import { getMyLearning } from '@/lib/learner/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!clerkEnabled || !process.env.DATABASE_URL) {
    return NextResponse.json({ slugs: [] });
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ slugs: [] }, { status: 401 });
  const learning = await getMyLearning(clerkId);
  return NextResponse.json(
    { slugs: learning.courses.map((c) => c.slug) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
