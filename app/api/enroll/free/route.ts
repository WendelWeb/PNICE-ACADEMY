/**
 * POST /api/enroll/free — enrol the signed-in user in an explicitly FREE
 * course (priceCents === 0, the studio's deliberate « Gratis » mode — see
 * lib/courses/pricing-rules.ts). No payment row, no teacher share (70% of
 * nothing), no receipt: just the enrollment, idempotently.
 *
 * Mirrors the checkout routes' guards on purpose (rate limit, auth, users
 * upsert, published-course resolution) — a free enrolment is still an
 * ACCESS GRANT, so it gets the same discipline as a paid one. The one rule
 * that matters most: the FRESH server price decides free-ness, never the
 * client's word — a hand-crafted POST against a paid course is refused.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, enrollments } from '@/db/schema';
import { clerkEnabled } from '@/lib/clerk';
import { getPublishedCourseBySlug } from '@/lib/courses/source';
import { rateLimit, ipFromHeaders, RATE_LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!clerkEnabled || !process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!rateLimit('checkout', ipFromHeaders(req.headers), RATE_LIMITS.checkout)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { courseSlug?: unknown } | null;
  const slug = typeof body?.courseSlug === 'string' ? body.courseSlug : null;
  if (!slug) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const course = await getPublishedCourseBySlug(slug);
  if (!course) return NextResponse.json({ error: 'unknown_product' }, { status: 404 });
  // THE gate: only a genuinely, currently free course can be joined free.
  if (course.priceUsd !== 0) return NextResponse.json({ error: 'not_free' }, { status: 400 });

  // Upsert the users row (the Clerk webhook may not have landed yet) —
  // same idiom as /api/checkout/moncash.
  let row = (await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1))[0];
  if (!row) {
    const cu = await currentUser();
    const primary = cu?.emailAddresses?.find((e) => e.id === cu?.primaryEmailAddressId);
    const email = primary?.emailAddress ?? cu?.emailAddresses?.[0]?.emailAddress;
    if (!email) return NextResponse.json({ error: 'no_email' }, { status: 400 });
    row = (
      await db
        .insert(users)
        .values({
          clerkId,
          email,
          name: [cu?.firstName, cu?.lastName].filter(Boolean).join(' ') || null,
        })
        .onConflictDoUpdate({ target: users.clerkId, set: { email } })
        .returning()
    )[0];
  }

  // Idempotent enrolment — same shape as the paid fulfil path and the
  // admin's grantCourseAccess.
  const existing = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, row.id), eq(enrollments.courseSlug, slug)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(enrollments).values({ userId: row.id, courseSlug: slug, status: 'active' });
  }

  return NextResponse.json({ ok: true, already: existing.length > 0 });
}
