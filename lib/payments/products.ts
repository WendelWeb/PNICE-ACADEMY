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
 *
 * Task: two subscription products — `kind` on `ResolvedProduct` says WHICH
 * pass a subscription purchase is for: 'teacher' (a specific teacher's own
 * catalogue, `?teacher=<slug>`) or 'platform' (the "Pass PNICE" all-access
 * pass, priced by the owner via lib/platformPrice.ts, everything else). This
 * is the fix for the bug where the bare `/checkout?plan=sub` path used to
 * silently charge teacher #1's own plan price and attribute 100% of the 70%
 * to them — `resolveDefaultSubscription` below now reads the OWNER-set
 * platform price instead, and carries no teacherPlanId/teacherUserId at all
 * (see lib/teacher/earnings.ts's header for how a 'platform' sale stays
 * unattributed). Always `null` for a course purchase, same as
 * `teacherPlanId`/`teacherUserId`.
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { dbConfigured, getPublishedCourseBySlug } from '@/lib/courses/source';
import { resolveTeacherOwnerUserIdBySlug } from '@/lib/teacher/public';
import { getTeacher, teachers } from '@/data/teachers';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import { getPlatformPassPriceCents } from '@/lib/platformPrice';

const T = schema;

export type ResolvedProduct = {
  productType: 'course' | 'subscription';
  courseSlug: string | null;
  nameFr: string;
  nameHt: string;
  amountCents: number;
  /** The specific `teacher_plans.id` charged, when resolvable — null for a
   *  course purchase or the platform-wide "Pass PNICE" subscription. */
  teacherPlanId: string | null;
  /** The plan owner's `users.id` — same nullability as `teacherPlanId`. */
  teacherUserId: string | null;
  /** 'teacher' | 'platform' for a subscription purchase (Task: two
   *  subscription products); always `null` for a course purchase. */
  kind: 'teacher' | 'platform' | null;
};

const GENERIC_NAME_HT = 'Pass PNICE — tout kou yo';
const GENERIC_NAME_FR = 'Pass PNICE — toutes les formations';

type ResolvedSubscription = {
  amountCents: number;
  nameHt: string;
  nameFr: string;
  teacherPlanId: string | null;
  teacherUserId: string | null;
  kind: 'teacher' | 'platform';
};

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
 * The platform-wide "Pass PNICE" subscription (no `teacherSlug` given — every
 * existing `/checkout?plan=sub` / bare `/checkout` entry point across the
 * site). Task: two subscription products — THIS is the fix for the bug that
 * used to live here: this path used to silently charge teacher #1's own
 * `teacher_plans` price and attribute 100% of the 70% to them (see git
 * history), which meant ANY teacher pricing their own plan low effectively
 * set the platform's all-access price and pocketed the whole commission.
 * Now it reads the OWNER-set price (lib/platformPrice.ts, gated + fallback to
 * the constant on its own) and carries no teacherPlanId/teacherUserId at
 * all — a 'platform' sale is deliberately unattributed at purchase time (see
 * lib/teacher/earnings.ts's header for the pro-rata-split seam). Never
 * throws: `getPlatformPassPriceCents` already degrades to the constant.
 */
async function resolveDefaultSubscription(): Promise<ResolvedSubscription> {
  const amountCents = await getPlatformPassPriceCents();
  return {
    amountCents,
    nameHt: GENERIC_NAME_HT,
    nameFr: GENERIC_NAME_FR,
    teacherPlanId: null,
    teacherUserId: null,
    kind: 'platform',
  };
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
 * the constant price (never `null`) — a fresh checkout of `/prof/pnice-academy`'s
 * own CTA must work with no DATABASE_URL configured, still tagged 'teacher'
 * since the visitor explicitly picked a named teacher's own plan (Task: two
 * subscription products) — access control itself is moot with no DB (every
 * lib/learner/access.ts reader is gated off `dbReady()` too), so this only
 * affects what a partially-configured deploy (Stripe keys, no DB) would tag.
 */
async function resolveNamedTeacherSubscription(teacherSlug: string): Promise<ResolvedSubscription | null> {
  if (!dbConfigured()) {
    const teacherOne = teachers[0];
    return teacherOne && teacherSlug === teacherOne.slug
      ? {
          amountCents: SUBSCRIPTION_USD * 100,
          nameHt: `Abònman chak mwa — ${teacherOne.displayName}`,
          nameFr: `Abonnement mensuel — ${teacherOne.displayName}`,
          teacherPlanId: null,
          teacherUserId: null,
          kind: 'teacher',
        }
      : null;
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
      kind: 'teacher',
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
      kind: resolved.kind,
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
    kind: null,
  };
}

const TEACHER_SUB_NAME_HT = 'Abònman chak mwa';
const TEACHER_SUB_NAME_FR = 'Abonnement mensuel';

/**
 * Display names for an EXISTING subscription, resolved off our own
 * `subscriptions` row's (`kind`, `teacherPlanId`) — the renewal-receipt email
 * (Stage 6, lib/payments/fulfill.ts's `fulfillInvoicePaid`) has no checkout
 * request in hand to run `resolveProduct` with, so this reuses the SAME
 * naming this module already produces at purchase time: the platform pass's
 * generic "Pass PNICE" names, or a teacher plan's own title / "Abònman chak
 * mwa — {displayName}". GATED + NEVER THROWS: any lookup miss degrades to the
 * generic teacher-subscription label, never blocks the caller.
 */
export async function resolveSubscriptionNaming(input: {
  kind: 'teacher' | 'platform' | null;
  teacherPlanId: string | null;
}): Promise<{ nameHt: string; nameFr: string }> {
  if (input.kind !== 'teacher') {
    return { nameHt: GENERIC_NAME_HT, nameFr: GENERIC_NAME_FR };
  }
  if (!input.teacherPlanId || !dbConfigured()) {
    return { nameHt: TEACHER_SUB_NAME_HT, nameFr: TEACHER_SUB_NAME_FR };
  }
  try {
    const [plan] = await db
      .select({ titleHt: T.teacherPlans.titleHt, titleFr: T.teacherPlans.titleFr, ownerUserId: T.teacherPlans.ownerUserId })
      .from(T.teacherPlans)
      .where(eq(T.teacherPlans.id, input.teacherPlanId))
      .limit(1);
    if (!plan) return { nameHt: TEACHER_SUB_NAME_HT, nameFr: TEACHER_SUB_NAME_FR };
    const titleHt = plan.titleHt?.trim();
    const titleFr = plan.titleFr?.trim();
    if (titleHt || titleFr) {
      return { nameHt: titleHt || titleFr || TEACHER_SUB_NAME_HT, nameFr: titleFr || titleHt || TEACHER_SUB_NAME_FR };
    }
    if (plan.ownerUserId) {
      const [prof] = await db
        .select({ displayName: T.teacherProfiles.displayName })
        .from(T.teacherProfiles)
        .where(eq(T.teacherProfiles.userId, plan.ownerUserId))
        .limit(1);
      const dn = prof?.displayName?.trim();
      if (dn) {
        return { nameHt: `${TEACHER_SUB_NAME_HT} — ${dn}`, nameFr: `${TEACHER_SUB_NAME_FR} — ${dn}` };
      }
    }
    return { nameHt: TEACHER_SUB_NAME_HT, nameFr: TEACHER_SUB_NAME_FR };
  } catch (err) {
    console.error('[payments/products] resolveSubscriptionNaming DB read failed, using generic label:', err);
    return { nameHt: TEACHER_SUB_NAME_HT, nameFr: TEACHER_SUB_NAME_FR };
  }
}
