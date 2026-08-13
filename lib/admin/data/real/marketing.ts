/**
 * Real (Drizzle) Marketing & acquisition domain (Task L2d) — promo codes, UTM
 * attribution, abandoned carts, referrals, referral credit. Same "load +
 * filter/sort in JS" style as ../subscriptions.ts and ../certificates.ts (these
 * tables are small — admin-managed promo codes, one checkout session per
 * attempt, one referral per invite). The mock
 * (`lib/admin/data/mock/index.ts` — promoStatusOf/promoDiscount/toPromoRow +
 * getPromoCodes/getPromoDetail/isPromoCodeFree/createPromoCode/setPromoActive/
 * deletePromoCode/validatePromo/redeemPromo/getUtmAttribution/
 * getAbandonedCarts/getOpenCarts/getCartStats/markCartAbandoned/remindCart/
 * getReferrers/getReferrerDetail/getReferralCreditCents/setReferralCredit) is
 * the reference for every method's exact shape and semantics; this file
 * reproduces that behaviour from real rows.
 *
 * `addManualCredit` is intentionally NOT here — it is already real in
 * ../users.ts and is spread from there in ./index.ts.
 *
 * Mutations write through `recordAudit` (../users.ts) — same audit path every
 * other real domain uses.
 *
 * SCHEMA-DRIVEN DEGENERACIES (documented once here; each method references the
 * matching note instead of repeating it):
 *
 *  1. `promo_redemptions` (db/schema.ts) has only id/userId/promoCodeId/
 *     relatedPaymentId/redeemedAt — it does NOT have productType, courseSlug,
 *     grossCents, discountCents, netCents, all present on the mock's
 *     `PromoRedemption`. Real checkout does not apply promo codes to actual
 *     charges yet (`app/api/checkout/route.ts`: "Promo codes intentionally
 *     NOT applied here until the promo domain is DB-backed" — payments wiring
 *     is FROZEN per the launch plan except where a task explicitly extends
 *     it), so `relatedPaymentId` is null on every redemption reachable today.
 *     `reconstructAmounts()` below:
 *       - if a future redemption DOES carry a `relatedPaymentId` (once a later
 *         task wires promos into real checkout), reconstructs the exact
 *         breakdown from the linked payment's real `amountCents` (net, what
 *         was actually charged) + the promo's own discount config — no data
 *         is fabricated, this is a faithful inverse of the forward discount
 *         formula;
 *       - otherwise (the only case possible today) returns
 *         grossCents/discountCents/netCents = 0 and a best-effort
 *         productType/courseSlug guessed from the promo's own scope (not the
 *         redemption, which carries no such fact). `getPromoDetail`'s revenue
 *         aggregates are therefore honestly 0 on real redemptions until
 *         promos are wired into checkout — not a bug, a documented gap.
 *
 *  2. `user_acquisition.utm_source/medium/campaign` are nullable in the real
 *     schema (an organic/direct signup has no UTM at all); the mock's dataset
 *     never has nulls there. Falls back to '(direct)' / '(none)' labels so
 *     `getUtmAttribution` still groups sensibly instead of grouping under
 *     `undefined`.
 *
 *  3. Referral credit default is NOT degenerate: `platform_settings` (db/
 *     schema.ts) is a real singleton row with `referral_credit_cents` (default
 *     500, i.e. $5). `getReferralCreditCents`/`setReferralCredit` read/upsert
 *     that row for real. No schema change was needed or made.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { paymentsSelectSafe, PAYMENTS_COLUMNS_PRE_0019 } from '@/db/payments-compat';
import { getCourseMap } from '@/lib/courses/source';
import type { Course } from '@/data/courses';
import { SUBSCRIPTION_USD } from '@/data/pricing';
import { recordAudit } from './users';
import { promoScopeOk } from '../promo-scope';
import type {
  AbandonedCartRow,
  AdminActor,
  AttemptRail,
  CartReminderStatus,
  CartStats,
  OpenCartRow,
  PromoCode,
  PromoDetail,
  PromoQuery,
  PromoRedemptionRow,
  PromoRow,
  PromoStatus,
  PromoValidation,
  ProductType,
  PurchaseAttempts,
  PurchaseAttemptRow,
  ReferralSortKey,
  ReferrerDetail,
  ReferrerRow,
  UtmQuery,
  UtmRow,
} from '../types';

const T = schema;
const SUB_CENTS = SUBSCRIPTION_USD * 100;

type DbPromo = typeof T.promoCodes.$inferSelect;
type DbRedemption = typeof T.promoRedemptions.$inferSelect;
type DbCheckout = typeof T.checkoutSessions.$inferSelect;
type DbUser = typeof T.users.$inferSelect;
type DbPayment = typeof T.payments.$inferSelect;

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return typeof d === 'string' ? d : d.toISOString();
}

/* ============================== promo codes =============================== */

function toPromoCode(r: DbPromo): PromoCode {
  return {
    id: r.id,
    code: r.code,
    discountType: r.discountType,
    discountValue: r.discountValue,
    appliesTo: r.appliesTo,
    courseSlug: r.courseSlug,
    maxUses: r.maxUses,
    usedCount: r.usedCount,
    expiresAt: iso(r.expiresAt),
    startsAt: iso(r.startsAt),
    isActive: r.isActive,
    createdAt: iso(r.createdAt)!,
  };
}

/** Mirrors the mock's `promoStatusOf` exactly. */
function promoStatusOf(c: PromoCode, now: number): PromoStatus {
  if (!c.isActive) return 'disabled';
  if (c.startsAt && Date.parse(c.startsAt) > now) return 'scheduled';
  if (c.expiresAt && Date.parse(c.expiresAt) < now) return 'expired';
  if (c.maxUses != null && c.usedCount >= c.maxUses) return 'depleted';
  return 'active';
}
/** Mirrors the mock's `promoDiscount` exactly. */
function promoDiscount(c: PromoCode, gross: number): number {
  return c.discountType === 'percent'
    ? Math.round((gross * c.discountValue) / 100)
    : Math.min(c.discountValue, gross);
}
function toPromoRow(c: PromoCode, now: number): PromoRow {
  return {
    ...c,
    status: promoStatusOf(c, now),
    usagePct: c.maxUses != null && c.maxUses > 0 ? Math.min(100, (c.usedCount / c.maxUses) * 100) : null,
  };
}

export async function getPromoCodes(query: PromoQuery): Promise<PromoRow[]> {
  const dbRows = await db.select().from(T.promoCodes);
  const now = Date.now();
  let rows = dbRows.map((r) => toPromoRow(toPromoCode(r), now));
  if (query.search) {
    const s = query.search.trim().toLowerCase();
    rows = rows.filter((r) => r.code.toLowerCase().includes(s));
  }
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.type) rows = rows.filter((r) => r.discountType === query.type);
  const dir = query.dir === 'asc' ? 1 : -1;
  const key = query.sort ?? 'expiry';
  rows.sort((a, b) => {
    if (key === 'usage') return ((a.usagePct ?? -1) - (b.usagePct ?? -1)) * dir;
    const av = a.expiresAt ? Date.parse(a.expiresAt) : Infinity; // no-expiry last
    const bv = b.expiresAt ? Date.parse(b.expiresAt) : Infinity;
    return (av - bv) * dir;
  });
  return rows;
}

/** See file-header degeneracy note (1). */
function reconstructAmounts(
  promo: PromoCode,
  pay: DbPayment | undefined,
): { productType: ProductType; courseSlug: string | null; grossCents: number; discountCents: number; netCents: number } {
  if (pay) {
    const netCents = pay.amountCents;
    const grossCents =
      promo.discountType === 'percent'
        ? promo.discountValue < 100
          ? Math.round(netCents / (1 - promo.discountValue / 100))
          : netCents // 100%-off: original price unrecoverable from a $0 charge
        : netCents + promo.discountValue;
    return {
      productType: pay.productType,
      courseSlug: pay.courseSlug,
      grossCents,
      discountCents: Math.max(0, grossCents - netCents),
      netCents,
    };
  }
  // No linked payment (the only case reachable today) — nothing to recover.
  const productType: ProductType = promo.appliesTo === 'subscription' ? 'subscription' : 'course';
  return { productType, courseSlug: promo.courseSlug, grossCents: 0, discountCents: 0, netCents: 0 };
}

export async function getPromoDetail(codeOrId: string): Promise<PromoDetail | null> {
  const key = codeOrId.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(T.promoCodes)
    .where(sql`lower(${T.promoCodes.code}) = ${key} or lower(${T.promoCodes.id}::text) = ${key}`)
    .limit(1);
  if (!row) return null;
  const promo = toPromoCode(row);
  const now = Date.now();

  const [redemptions, users, payments] = await Promise.all([
    db.select().from(T.promoRedemptions).where(eq(T.promoRedemptions.promoCodeId, promo.id)),
    db.select().from(T.users),
    paymentsSelectSafe(
      () => db.select().from(T.payments),
      () => db.select(PAYMENTS_COLUMNS_PRE_0019).from(T.payments),
    ),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const paymentById = new Map(payments.map((p) => [p.id, p]));

  const rows: PromoRedemptionRow[] = redemptions
    .sort((a, b) => b.redeemedAt.getTime() - a.redeemedAt.getTime())
    .map((r) => {
      const u = userById.get(r.userId);
      const pay = r.relatedPaymentId ? paymentById.get(r.relatedPaymentId) : undefined;
      const amounts = reconstructAmounts(promo, pay);
      return {
        id: r.id,
        promoCodeId: r.promoCodeId,
        userId: r.userId,
        paymentId: r.relatedPaymentId,
        productType: amounts.productType,
        courseSlug: amounts.courseSlug,
        grossCents: amounts.grossCents,
        discountCents: amounts.discountCents,
        netCents: amounts.netCents,
        redeemedAt: iso(r.redeemedAt)!,
        userName: u?.name ?? u?.email ?? '—',
        userEmail: u?.email ?? '—',
      };
    });

  return {
    promo: toPromoRow(promo, now),
    redemptions: rows,
    revenueGeneratedCents: rows.reduce((s, r) => s + r.netCents, 0),
    revenueUndiscountedCents: rows.reduce((s, r) => s + r.grossCents, 0),
    discountGivenCents: rows.reduce((s, r) => s + r.discountCents, 0),
  };
}

export async function isPromoCodeFree(code: string): Promise<boolean> {
  const k = code.trim().toLowerCase();
  if (!k) return false;
  const [row] = await db
    .select({ id: T.promoCodes.id })
    .from(T.promoCodes)
    .where(sql`lower(${T.promoCodes.code}) = ${k}`)
    .limit(1);
  return !row;
}

export async function createPromoCode(p: {
  input: Omit<PromoCode, 'id' | 'usedCount' | 'createdAt'>;
  admin: AdminActor;
}): Promise<{ ok: boolean; message?: string; code?: string }> {
  const code = p.input.code.trim().toUpperCase();
  if (!code) return { ok: false, message: 'code_required' };
  if (p.input.discountType === 'percent' && (p.input.discountValue < 1 || p.input.discountValue > 100))
    return { ok: false, message: 'bad_percent' };
  if (p.input.discountType === 'fixed' && p.input.discountValue <= 0) return { ok: false, message: 'bad_fixed' };

  const [existing] = await db
    .select({ id: T.promoCodes.id })
    .from(T.promoCodes)
    .where(sql`lower(${T.promoCodes.code}) = ${code.toLowerCase()}`)
    .limit(1);
  if (existing) return { ok: false, message: 'duplicate' };

  try {
    await db.insert(T.promoCodes).values({
      code,
      discountType: p.input.discountType,
      discountValue: p.input.discountValue,
      appliesTo: p.input.appliesTo,
      courseSlug: p.input.appliesTo === 'course' ? p.input.courseSlug : null,
      maxUses: p.input.maxUses,
      expiresAt: p.input.expiresAt ? new Date(p.input.expiresAt) : null,
      startsAt: p.input.startsAt ? new Date(p.input.startsAt) : null,
      isActive: p.input.isActive,
    });
  } catch {
    // Unique constraint on `code` — race with a concurrent create.
    return { ok: false, message: 'duplicate' };
  }

  await recordAudit({ action: 'create_promo', userId: p.admin.id, admin: p.admin, detail: code });
  return { ok: true, code };
}

export async function setPromoActive(p: { id: string; active: boolean; admin: AdminActor }): Promise<void> {
  const [row] = await db.select().from(T.promoCodes).where(eq(T.promoCodes.id, p.id)).limit(1);
  await db.update(T.promoCodes).set({ isActive: p.active }).where(eq(T.promoCodes.id, p.id));
  await recordAudit({
    action: p.active ? 'enable_promo' : 'disable_promo',
    userId: p.admin.id,
    admin: p.admin,
    detail: row?.code,
  });
}

export async function deletePromoCode(p: { id: string; admin: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  const [row] = await db.select().from(T.promoCodes).where(eq(T.promoCodes.id, p.id)).limit(1);
  if (!row) return { ok: false, message: 'not_found' };
  if (row.usedCount > 0) return { ok: false, message: 'has_redemptions' };
  await db.delete(T.promoCodes).where(eq(T.promoCodes.id, p.id));
  await recordAudit({ action: 'delete_promo', userId: p.admin.id, admin: p.admin, detail: row.code });
  return { ok: true };
}

/**
 * PUBLIC / no side effect — gates real discounts at checkout.
 *
 * SCOPE, and the marketplace-boundary fix this carries (Stage 1): a promo
 * the platform creates must never unilaterally discount a THIRD-PARTY
 * teacher's own money without their consent. `appliesTo: 'subscription'` and
 * `'all'` therefore only ever match the platform's OWN "Pass PNICE"
 * (`p.productKind === 'platform'`) — never a named teacher's own
 * subscription plan (`'teacher'`), even though both are `productType:
 * 'subscription'`. `'course'` still requires an EXACT slug match (the old
 * `!promo.courseSlug` "any course" fallback is gone — every course belongs
 * to some teacher now, so a blanket course-wide promo would have the exact
 * same problem; the admin UI has never produced a null `courseSlug` for a
 * `'course'` promo, this closes the same hole for a hand-crafted row).
 * A real per-teacher opt-in/consent flow (a schema change, tracked
 * separately) is the follow-up for course- and teacher-plan-scoped
 * discounts; until then this is the safe default: the platform can only
 * ever discount its own product.
 */
export async function validatePromo(p: {
  code: string;
  productType: ProductType;
  courseSlug: string | null;
  grossCents: number;
  productKind: 'teacher' | 'platform' | null;
}): Promise<PromoValidation> {
  const code = p.code.trim();
  const [row] = await db
    .select()
    .from(T.promoCodes)
    .where(sql`lower(${T.promoCodes.code}) = ${code.toLowerCase()}`)
    .limit(1);
  if (!row) return { valid: false, reason: 'not_found', code };
  const promo = toPromoCode(row);
  const now = Date.now();
  const status = promoStatusOf(promo, now);
  if (status === 'disabled') return { valid: false, reason: 'inactive', code: promo.code };
  if (status === 'scheduled') return { valid: false, reason: 'scheduled', code: promo.code };
  if (status === 'expired') return { valid: false, reason: 'expired', code: promo.code };
  if (status === 'depleted') return { valid: false, reason: 'depleted', code: promo.code };
  const scopeOk = promoScopeOk(promo, { productType: p.productType, courseSlug: p.courseSlug, productKind: p.productKind });
  if (!scopeOk) return { valid: false, reason: 'wrong_product', code: promo.code };
  const discountCents = promoDiscount(promo, p.grossCents);
  return {
    valid: true,
    reason: 'ok',
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    grossCents: p.grossCents,
    discountCents,
    netCents: p.grossCents - discountCents,
  };
}

/** See file-header degeneracy note (1) — the financial breakdown the mock
 *  stores per redemption has no column here; only the redemption fact + the
 *  usedCount bump are persisted. */
export async function redeemPromo(p: { code: string; userId: string; admin: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  const now = Date.now();
  const [row] = await db
    .select()
    .from(T.promoCodes)
    .where(sql`lower(${T.promoCodes.code}) = ${p.code.trim().toLowerCase()}`)
    .limit(1);
  if (!row) return { ok: false, message: 'not_found' };
  const promo = toPromoCode(row);
  if (promoStatusOf(promo, now) !== 'active') return { ok: false, message: 'not_active' };
  const [user] = await db.select().from(T.users).where(eq(T.users.id, p.userId)).limit(1);
  if (!user) return { ok: false, message: 'user_not_found' };

  await db.insert(T.promoRedemptions).values({ userId: p.userId, promoCodeId: promo.id, relatedPaymentId: null });
  await db
    .update(T.promoCodes)
    .set({ usedCount: sql`${T.promoCodes.usedCount} + 1` })
    .where(eq(T.promoCodes.id, promo.id));
  await recordAudit({ action: 'redeem_promo', userId: p.userId, admin: p.admin, detail: promo.code });
  return { ok: true };
}

/* ================================== UTM ==================================== */

/** See file-header degeneracy note (2) for the '(direct)'/'(none)' fallback. */
export async function getUtmAttribution(query: UtmQuery): Promise<UtmRow[]> {
  const [acqRows, payments, subs] = await Promise.all([
    db.select().from(T.userAcquisition),
    paymentsSelectSafe(
      () => db.select().from(T.payments),
      () => db.select(PAYMENTS_COLUMNS_PRE_0019).from(T.payments),
    ),
    db.select().from(T.subscriptions),
  ]);
  const inRange = (isoStr: string) =>
    (!query.from || isoStr >= query.from) && (!query.to || isoStr <= query.to + 'T23:59:59.999Z');
  const payingIds = new Set(payments.filter((p) => p.status === 'completed').map((p) => p.userId));
  for (const s of subs) if (s.status === 'active') payingIds.add(s.userId);
  const revByUser = new Map<string, number>();
  for (const p of payments) if (p.status === 'completed') revByUser.set(p.userId, (revByUser.get(p.userId) ?? 0) + p.amountCents);

  const groups = new Map<string, UtmRow>();
  for (const a of acqRows) {
    const capturedAt = iso(a.capturedAt)!;
    if (!inRange(capturedAt)) continue;
    const source = a.utmSource || '(direct)';
    const medium = a.utmMedium || '(none)';
    const campaign = a.utmCampaign || '(none)';
    const key = `${source}|${medium}|${campaign}`;
    let g = groups.get(key);
    if (!g) {
      g = { source, medium, campaign, signups: 0, converted: 0, revenueCents: 0, conversionPct: 0 };
      groups.set(key, g);
    }
    g.signups++;
    if (payingIds.has(a.userId)) g.converted++;
    g.revenueCents += revByUser.get(a.userId) ?? 0;
  }
  const rows = [...groups.values()];
  for (const g of rows) g.conversionPct = g.signups ? (g.converted / g.signups) * 100 : 0;
  return rows.sort((a, b) => b.signups - a.signups);
}

/* =========================== abandoned carts =============================== */

function cartReminderStatus(s: DbCheckout): CartReminderStatus {
  if (s.remindedAt && s.completedAt && s.completedAt.getTime() >= s.remindedAt.getTime()) return 'converted';
  if (s.remindedAt) return 'reminded';
  return 'never';
}
function toAbandonedRow(s: DbCheckout, userById: Map<string, DbUser>, courseBySlug: Map<string, Course>): AbandonedCartRow {
  const u = s.userId ? userById.get(s.userId) : undefined;
  const c = s.courseSlug ? courseBySlug.get(s.courseSlug) : undefined;
  const isSub = s.productType === 'subscription';
  return {
    id: s.id,
    userId: s.userId,
    isGuest: !s.userId,
    userName: u?.name ?? u?.email ?? '',
    userEmail: u?.email ?? null,
    productType: s.productType,
    productCode: isSub ? null : (c?.code ?? null),
    productTitle_fr: isSub ? 'Abonnement mensuel' : (c?.title_fr ?? s.courseSlug ?? '—'),
    productTitle_ht: isSub ? 'Abònman mansyèl' : (c?.title_ht ?? s.courseSlug ?? '—'),
    amountCents: s.amountCents,
    startedAt: iso(s.startedAt)!,
    abandonedAt: iso(s.abandonedAt),
    reminderStatus: cartReminderStatus(s),
  };
}

export async function getAbandonedCarts(): Promise<AbandonedCartRow[]> {
  const [sessions, users, courseBySlug] = await Promise.all([
    db.select().from(T.checkoutSessions).where(sql`${T.checkoutSessions.abandonedAt} is not null`),
    db.select().from(T.users),
    getCourseMap(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  return sessions
    .map((s) => toAbandonedRow(s, userById, courseBySlug))
    .sort((a, b) => (b.abandonedAt ?? '').localeCompare(a.abandonedAt ?? ''));
}

export async function getOpenCarts(): Promise<OpenCartRow[]> {
  const [sessions, users, courseBySlug] = await Promise.all([
    db
      .select()
      .from(T.checkoutSessions)
      .where(and(isNull(T.checkoutSessions.abandonedAt), isNull(T.checkoutSessions.completedAt))),
    db.select().from(T.users),
    getCourseMap(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  return sessions
    .map((s) => {
      const u = s.userId ? userById.get(s.userId) : undefined;
      const c = s.courseSlug ? courseBySlug.get(s.courseSlug) : undefined;
      const isSub = s.productType === 'subscription';
      return {
        id: s.id,
        userName: u?.name ?? u?.email ?? '',
        productTitle_fr: isSub ? 'Abonnement mensuel' : (c?.title_fr ?? s.courseSlug ?? '—'),
        productTitle_ht: isSub ? 'Abònman mansyèl' : (c?.title_ht ?? s.courseSlug ?? '—'),
        amountCents: s.amountCents,
        startedAt: iso(s.startedAt)!,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getCartStats(): Promise<CartStats> {
  const carts = await getAbandonedCarts();
  const reminded = carts.filter((c) => c.reminderStatus !== 'never').length;
  const convertedAfterReminder = carts.filter((c) => c.reminderStatus === 'converted').length;
  return {
    abandoned: carts.length,
    reminded,
    convertedAfterReminder,
    reminderConversionPct: reminded ? (convertedAfterReminder / reminded) * 100 : 0,
  };
}

const RECENT_ATTEMPTS_LIMIT = 25;

// Same encoding lib/payments/moncash-order.ts's `encodeMoncashRef` writes
// (`moncash:<locale>[:<providerRef>]`, or `moncash:<locale>:<providerId>:
// <providerRef>` once a provider id is known — this check only cares whether
// SOMETHING follows the locale, so either shape reads the same here) —
// deliberately duplicated as a tiny PURE string check rather than imported:
// that module pulls in
// `fulfillMoncashOrder` → lib/teacher/earnings.ts → lib/teacher/profile.ts →
// `@clerk/nextjs/server` ('server-only'), and this admin-data barrel is
// reachable from a CLIENT component (components/reviews/RatingWidget.tsx →
// lib/reviews/reviews.ts → lib/admin/data), so importing it here fails the
// build the exact same way lib/admin/data/real/users.ts's `refundPayment`
// doc comment already explains for `recordRefundReversal`. If that prefix
// ever changes, update it there AND here.
const MONCASH_REF_PREFIX = 'moncash:';

/**
 * The rail + "did the provider actually create an order" signal, derived
 * from `checkout_sessions.session_id` alone — no schema change. Both
 * checkout routes (app/api/checkout/route.ts, app/api/checkout/moncash/
 * route.ts) insert the row with `session_id` UNSET, then set it only once
 * the provider call itself succeeds:
 *  - MonCash: `moncash:<locale>` is written BEFORE calling Bazik/Digicel,
 *    then rewritten to `moncash:<locale>:<providerRef>` only on success. A
 *    row stuck at `moncash:<locale>` with no providerRef means the provider
 *    call itself failed (a genuine outage), not that the buyer walked away.
 *  - Stripe: `session_id` is null until `createStripeCheckout` succeeds.
 */
export function attemptRailOf(sessionId: string | null): { rail: AttemptRail; providerOrderCreated: boolean } {
  if (typeof sessionId === 'string' && sessionId.startsWith(MONCASH_REF_PREFIX)) {
    const rest = sessionId.slice(MONCASH_REF_PREFIX.length);
    const sep = rest.indexOf(':');
    const providerRef = sep === -1 ? '' : rest.slice(sep + 1).trim();
    return { rail: 'moncash', providerOrderCreated: providerRef !== '' };
  }
  return { rail: 'card', providerOrderCreated: sessionId !== null };
}

/**
 * Stage 3 finance surface, item 1 — /admin/transactions' "purchase attempts"
 * panel: every checkout_sessions row (completed or not), a conversion stat
 * by rail, and the most recent NON-completed attempts (open or abandoned)
 * with when/who/product/amount/rail/provider-order-created — the view the
 * owner had no way to see from the money pages themselves (only reachable,
 * before this, via Marketing > Carts, gated on a different capability).
 */
export async function getPurchaseAttempts(): Promise<PurchaseAttempts> {
  const [sessions, users, courseBySlug] = await Promise.all([
    db.select().from(T.checkoutSessions),
    db.select().from(T.users),
    getCourseMap(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));

  const byRail = new Map<AttemptRail, { attempts: number; completed: number }>();
  let completed = 0;
  for (const s of sessions) {
    const { rail } = attemptRailOf(s.sessionId);
    const isDone = s.completedAt != null;
    if (isDone) completed++;
    const acc = byRail.get(rail) ?? { attempts: 0, completed: 0 };
    acc.attempts++;
    if (isDone) acc.completed++;
    byRail.set(rail, acc);
  }

  const recent: PurchaseAttemptRow[] = sessions
    .filter((s) => s.completedAt == null)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, RECENT_ATTEMPTS_LIMIT)
    .map((s) => {
      const u = s.userId ? userById.get(s.userId) : undefined;
      const c = s.courseSlug ? courseBySlug.get(s.courseSlug) : undefined;
      const isSub = s.productType === 'subscription';
      const { rail, providerOrderCreated } = attemptRailOf(s.sessionId);
      return {
        id: s.id,
        userId: s.userId,
        isGuest: !s.userId,
        userName: u?.name ?? u?.email ?? '',
        userEmail: u?.email ?? null,
        productType: s.productType,
        productTitle_fr: isSub ? 'Abonnement mensuel' : (c?.title_fr ?? s.courseSlug ?? '—'),
        productTitle_ht: isSub ? 'Abònman mansyèl' : (c?.title_ht ?? s.courseSlug ?? '—'),
        amountCents: s.amountCents,
        rail,
        providerOrderCreated,
        startedAt: iso(s.startedAt)!,
        state: s.abandonedAt != null ? 'abandoned' : 'open',
      };
    });

  return {
    stats: {
      totalAttempts: sessions.length,
      completed,
      conversionPct: sessions.length ? (completed / sessions.length) * 100 : 0,
      byRail: [...byRail.entries()]
        .map(([rail, v]) => ({ rail, attempts: v.attempts, completed: v.completed }))
        .sort((a, b) => b.attempts - a.attempts),
    },
    recent,
  };
}

/** Sim of the 2h cron — not an admin business decision, so not audited (mirrors mock). */
export async function markCartAbandoned(p: { id: string; admin: AdminActor }): Promise<void> {
  await db
    .update(T.checkoutSessions)
    .set({ abandonedAt: new Date() })
    .where(
      and(
        eq(T.checkoutSessions.id, p.id),
        isNull(T.checkoutSessions.abandonedAt),
        isNull(T.checkoutSessions.completedAt),
      ),
    );
}

export async function remindCart(p: { id: string; admin: AdminActor }): Promise<{ ok: boolean; message?: string }> {
  const [s] = await db.select().from(T.checkoutSessions).where(eq(T.checkoutSessions.id, p.id)).limit(1);
  if (!s) return { ok: false, message: 'not_found' };
  if (!s.userId) return { ok: false, message: 'guest_no_email' };
  if (!s.abandonedAt) return { ok: false, message: 'not_abandoned' };
  if (s.remindedAt) return { ok: false, message: 'already_reminded' };
  await db.update(T.checkoutSessions).set({ remindedAt: new Date() }).where(eq(T.checkoutSessions.id, p.id));
  // Production: enqueue a Resend "you left something behind" email (see mock's
  // identical comment) — one reminder per cart, no auto sequence.
  await recordAudit({ action: 'cart_reminder', userId: s.userId, admin: p.admin, detail: s.id });
  return { ok: true };
}

/* =============================== referrals ================================= */

export async function getReferrers(sort: ReferralSortKey): Promise<ReferrerRow[]> {
  const [refs, users, credits] = await Promise.all([
    db.select().from(T.referrals),
    db.select().from(T.users),
    db.select().from(T.creditLedger),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const creditByUser = new Map<string, number>();
  for (const c of credits) if (c.reason === 'referral') creditByUser.set(c.userId, (creditByUser.get(c.userId) ?? 0) + c.amountCents);

  const byReferrer = new Map<string, { code: string; invited: number; converted: number }>();
  for (const r of refs) {
    let g = byReferrer.get(r.referrerUserId);
    if (!g) {
      g = { code: r.referralCode, invited: 0, converted: 0 };
      byReferrer.set(r.referrerUserId, g);
    }
    g.invited++;
    if (r.status === 'confirmed') g.converted++;
  }
  const rows: ReferrerRow[] = [...byReferrer.entries()].map(([userId, g]) => {
    const u = userById.get(userId);
    return {
      userId,
      userName: u?.name ?? u?.email ?? '—',
      userEmail: u?.email ?? '—',
      referralCode: g.code,
      invited: g.invited,
      converted: g.converted,
      creditsCents: creditByUser.get(userId) ?? 0,
    };
  });
  rows.sort((a, b) => (sort === 'credits' ? b.creditsCents - a.creditsCents : b.converted - a.converted));
  return rows;
}

export async function getReferrerDetail(userId: string): Promise<ReferrerDetail | null> {
  const referrer = (await getReferrers('converted')).find((r) => r.userId === userId);
  if (!referrer) return null;
  const [refs, users] = await Promise.all([
    db.select().from(T.referrals).where(eq(T.referrals.referrerUserId, userId)),
    db.select().from(T.users),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const filleuls = refs
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      userId: r.referredUserId,
      userName: r.referredUserId ? (userById.get(r.referredUserId)?.name ?? userById.get(r.referredUserId)?.email ?? '—') : '',
      status: r.status,
      createdAt: iso(r.createdAt)!,
      confirmedAt: iso(r.confirmedAt),
    }));
  return { referrer, filleuls };
}

/** See file-header degeneracy note (3) — real singleton row, no schema gap. */
export async function getReferralCreditCents(): Promise<number> {
  const [row] = await db.select().from(T.platformSettings).where(eq(T.platformSettings.id, 'singleton')).limit(1);
  return row?.referralCreditCents ?? 500; // matches the column's own default when the singleton hasn't been created yet
}

export async function setReferralCredit(p: { cents: number; admin: AdminActor }): Promise<void> {
  const cents = Math.max(0, Math.round(p.cents));
  await db
    .insert(T.platformSettings)
    .values({ id: 'singleton', subscriptionUsdCents: SUB_CENTS, referralCreditCents: cents })
    .onConflictDoUpdate({ target: T.platformSettings.id, set: { referralCreditCents: cents, updatedAt: new Date() } });
  await recordAudit({ action: 'set_referral_credit', userId: p.admin.id, admin: p.admin, detail: String(p.cents) });
}
