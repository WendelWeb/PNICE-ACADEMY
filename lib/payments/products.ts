/**
 * Resolve what is being bought into a display name + amount in cents.
 * Single source of truth for checkout amounts: `lib/courses/source.ts`
 * (course price/title — DB-backed, gated, falls back to the static
 * `data/courses.ts` catalog, Task C2-T5) + `data/pricing.ts` (the constant
 * subscription price, now only the FALLBACK — see below).
 *
 * Async because the course lookup is now a DB read (`getCourseBySlug`) so
 * the price charged at checkout is always the owner's CURRENT price for that
 * course (CMS-editable since Task C2-T4), not a stale build-time constant —
 * identical to today's amount while the DB fallback is in effect (same
 * static numbers, same shape).
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured, getPublishedCourseBySlug } from '@/lib/courses/source';
import { getTeacherOwnerUserId } from '@/lib/reviews/reviews';
import { teachers } from '@/data/teachers';
import { SUBSCRIPTION_USD } from '@/data/pricing';

const T = schema;

export type ResolvedProduct = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  nameFr: string;
  nameHt: string;
  amountCents: number;
};

/**
 * Task: per-teacher plan pricing — "each teacher sets their own price"
 * (owner ask). The `/checkout` subscription flow today sells exactly one
 * product: the platform's own all-access pass, i.e. teacher #1's
 * `teacher_plans` row (there is no per-teacher subscription checkout UI
 * yet — that would need `lib/payments/checkout-body.ts` + the checkout page
 * to carry a teacher identity, out of scope here). Resolving THEIR plan
 * means a price the owner sets from their studio (lib/teacher/studio-actions.ts's
 * `updateMyPlanAction`) takes effect at checkout immediately, instead of the
 * constant below, which now serves only as the pre-migration/no-plan-yet
 * fallback. GATED + FALLBACK: no DATABASE_URL, no resolvable owner/plan, or
 * a failed query ⇒ `SUBSCRIPTION_USD * 100`, never throws — this is exactly
 * what keeps teacher #1's seeded $79 plan behaving identically before AND
 * after `db:push` (see lib/payments/products.test.ts).
 */
async function resolveSubscriptionAmountCents(): Promise<number> {
  const fallbackCents = SUBSCRIPTION_USD * 100;
  if (!dbConfigured()) return fallbackCents;
  try {
    const teacherOne = teachers[0];
    if (!teacherOne) return fallbackCents;
    const ownerUserId = await getTeacherOwnerUserId(teacherOne.courseSlugs);
    if (!ownerUserId) return fallbackCents;
    const [plan] = await db
      .select({ priceCentsMonthly: T.teacherPlans.priceCentsMonthly })
      .from(T.teacherPlans)
      .where(and(eq(T.teacherPlans.ownerUserId, ownerUserId), eq(T.teacherPlans.status, 'active')))
      .limit(1);
    return typeof plan?.priceCentsMonthly === 'number' && plan.priceCentsMonthly > 0
      ? plan.priceCentsMonthly
      : fallbackCents;
  } catch (err) {
    console.error('[payments/products] resolveSubscriptionAmountCents DB read failed, falling back to constant:', err);
    return fallbackCents;
  }
}

export async function resolveProduct(input: {
  productType: 'course' | 'subscription';
  courseSlug?: string | null;
}): Promise<ResolvedProduct | null> {
  if (input.productType === 'subscription') {
    return {
      productType: 'subscription',
      courseSlug: null,
      nameFr: 'Abonnement mensuel PNICE Academy',
      nameHt: 'Abònman chak mwa PNICE Academy',
      amountCents: await resolveSubscriptionAmountCents(),
    };
  }
  if (!input.courseSlug) return null;
  const course = await getPublishedCourseBySlug(input.courseSlug);
  if (!course) return null;
  return {
    productType: 'course',
    courseSlug: course.slug,
    nameFr: course.title_fr,
    nameHt: course.title_ht,
    amountCents: Math.round(course.priceUsd * 100),
  };
}
