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
 *
 * Task: per-teacher subscription checkout — `resolveProduct` now accepts an
 * optional `teacherSlug` so `/checkout?teacher=<slug>` (from `/prof/[slug]`)
 * charges THAT teacher's own `teacher_plans` price, not always teacher #1's.
 * `teacherPlanId`/`teacherUserId` round-trip onto `ResolvedProduct` so the
 * caller (lib/payments/stripe.ts's `createStripeCheckout`) can carry them
 * into Stripe metadata, which `lib/payments/fulfill.ts` reads back to credit
 * the RIGHT teacher's earnings-ledger 70% (lib/teacher/earnings.ts) instead
 * of guessing "the first active plan". GATED + FALLBACK throughout: no
 * DATABASE_URL, no resolvable owner/plan, or a failed query never throws —
 * see `resolveTeacherSubscription` below for the exact fallback ladder.
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured, getPublishedCourseBySlug } from '@/lib/courses/source';
import { getTeacherOwnerUserId } from '@/lib/reviews/reviews';
import { resolveTeacherOwnerUserIdBySlug } from '@/lib/teacher/public';
import { getTeacher, teachers } from '@/data/teachers';
import { SUBSCRIPTION_USD } from '@/data/pricing';

const T = schema;

export type ResolvedProduct = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  nameFr: string;
  nameHt: string;
  amountCents: number;
  /** The specific `teacher_plans.id` charged, when resolvable — null for a
   *  course purchase or a subscription that fell back to the platform
   *  default with no live DB. */
  teacherPlanId: string | null;
  /** The plan owner's `users.id` — same nullability as `teacherPlanId`. */
  teacherUserId: string | null;
};

const GENERIC_NAME_HT = 'Abònman chak mwa PNICE Academy';
const GENERIC_NAME_FR = 'Abonnement mensuel PNICE Academy';

type ResolvedSubscription = {
  amountCents: number;
  nameHt: string;
  nameFr: string;
  teacherPlanId: string | null;
  teacherUserId: string | null;
};

function fallbackSubscription(): ResolvedSubscription {
  return {
    amountCents: SUBSCRIPTION_USD * 100,
    nameHt: GENERIC_NAME_HT,
    nameFr: GENERIC_NAME_FR,
    teacherPlanId: null,
    teacherUserId: null,
  };
}

/** A teacher's own `display_name` for the Stripe line-item name only (not
 *  the public-facing overlay lib/teacher/public.ts's `resolvePublicIdentity`
 *  computes — this is intentionally simpler since it's never rendered on our
 *  own pages, only inside Stripe's hosted checkout / receipts). Static
 *  registry first (byte-identical to `data/teachers.ts`), else the live
 *  `teacher_profiles.display_name` for the resolved owner. Never throws. */
async function resolveTeacherDisplayName(slug: string, ownerUserId: string): Promise<string> {
  const staticTeacher = getTeacher(slug);
  if (staticTeacher) return staticTeacher.displayName;
  try {
    const [row] = await db
      .select({ displayName: T.teacherProfiles.displayName })
      .from(T.teacherProfiles)
      .where(eq(T.teacherProfiles.userId, ownerUserId))
      .limit(1);
    return row?.displayName?.trim() || 'Anseyan';
  } catch (err) {
    console.error('[payments/products] resolveTeacherDisplayName DB read failed, using generic label:', err);
    return 'Anseyan';
  }
}

/** The active `teacher_plans` row (id + effective price) for an owner, or
 *  `null` if none. A row with no `price_cents_monthly` set (shouldn't happen
 *  via the studio form, but the column is nullable) falls back to the
 *  platform default, mirroring the studio page's own
 *  `myPlan?.priceCentsMonthly ?? SUBSCRIPTION_USD * 100` pattern. */
async function activePlanFor(ownerUserId: string): Promise<{ id: string; amountCents: number } | null> {
  const [plan] = await db
    .select({ id: T.teacherPlans.id, priceCentsMonthly: T.teacherPlans.priceCentsMonthly })
    .from(T.teacherPlans)
    .where(and(eq(T.teacherPlans.ownerUserId, ownerUserId), eq(T.teacherPlans.status, 'active')))
    .limit(1);
  if (!plan) return null;
  const amountCents =
    typeof plan.priceCentsMonthly === 'number' && plan.priceCentsMonthly > 0
      ? plan.priceCentsMonthly
      : SUBSCRIPTION_USD * 100;
  return { id: plan.id, amountCents };
}

/**
 * The platform-default subscription (no `teacherSlug` given — every existing
 * `/checkout?plan=sub` / bare `/checkout` entry point across the site).
 * BEHAVIOR UNCHANGED from before this task (byte-identical `amountCents` —
 * see products.test.ts): teacher #1's own active plan, or the constant.
 * ADDITIVE: now ALSO returns that plan's id/owner so the earnings ledger can
 * credit the resolved teacher precisely instead of a separate "first active
 * plan" guess (closes the gap flagged in lib/teacher/earnings.ts's header —
 * harmless while there was only ever one active plan, live once a 2nd
 * teacher sets their own price).
 */
async function resolveDefaultSubscription(): Promise<ResolvedSubscription> {
  if (!dbConfigured()) return fallbackSubscription();
  try {
    const teacherOne = teachers[0];
    if (!teacherOne) return fallbackSubscription();
    const ownerUserId = await getTeacherOwnerUserId(teacherOne.courseSlugs);
    if (!ownerUserId) return fallbackSubscription();
    const plan = await activePlanFor(ownerUserId);
    if (!plan) return fallbackSubscription();
    return {
      amountCents: plan.amountCents,
      nameHt: GENERIC_NAME_HT,
      nameFr: GENERIC_NAME_FR,
      teacherPlanId: plan.id,
      teacherUserId: ownerUserId,
    };
  } catch (err) {
    console.error('[payments/products] resolveDefaultSubscription DB read failed, falling back to constant:', err);
    return fallbackSubscription();
  }
}

/**
 * A SPECIFIC teacher's subscription (`/prof/[slug]`'s CTA →
 * `/checkout?teacher=<slug>`, Task: per-teacher subscription checkout).
 * Resolves the owner from the same slug registry `/prof/[slug]` itself uses
 * (static `data/teachers.ts` first, then an approved `teacher_profiles.slug`
 * — see `resolveTeacherOwnerUserIdBySlug`), then that owner's ACTIVE plan.
 * `null` when the teacher/plan can't be resolved — a genuinely unknown slug,
 * or a teacher with no active plan to sell — the caller (POST /api/checkout)
 * already turns a null `resolveProduct` result into `400 unknown_product`,
 * same as an unknown course slug.
 *
 * EXCEPTION for teacher #1 with no live DB: their own slug still resolves to
 * the platform-default constant (never `null`) — a fresh checkout of
 * `/prof/pnice-academy`'s own CTA must work identically to the legacy bare
 * `/checkout?plan=sub` link with no DATABASE_URL configured.
 */
async function resolveNamedTeacherSubscription(teacherSlug: string): Promise<ResolvedSubscription | null> {
  if (!dbConfigured()) {
    const teacherOne = teachers[0];
    return teacherOne && teacherSlug === teacherOne.slug ? fallbackSubscription() : null;
  }
  try {
    const ownerUserId = await resolveTeacherOwnerUserIdBySlug(teacherSlug);
    if (!ownerUserId) return null;
    const plan = await activePlanFor(ownerUserId);
    if (!plan) return null;
    const displayName = await resolveTeacherDisplayName(teacherSlug, ownerUserId);
    return {
      amountCents: plan.amountCents,
      nameHt: `Abònman chak mwa — ${displayName}`,
      nameFr: `Abonnement mensuel — ${displayName}`,
      teacherPlanId: plan.id,
      teacherUserId: ownerUserId,
    };
  } catch (err) {
    console.error('[payments/products] resolveNamedTeacherSubscription DB read failed:', err);
    return null;
  }
}

export async function resolveProduct(input: {
  productType: 'course' | 'subscription';
  courseSlug?: string | null;
  teacherSlug?: string | null;
}): Promise<ResolvedProduct | null> {
  if (input.productType === 'subscription') {
    const resolved = input.teacherSlug
      ? await resolveNamedTeacherSubscription(input.teacherSlug)
      : await resolveDefaultSubscription();
    if (!resolved) return null;
    return {
      productType: 'subscription',
      courseSlug: null,
      nameFr: resolved.nameFr,
      nameHt: resolved.nameHt,
      amountCents: resolved.amountCents,
      teacherPlanId: resolved.teacherPlanId,
      teacherUserId: resolved.teacherUserId,
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
    teacherPlanId: null,
    teacherUserId: null,
  };
}
