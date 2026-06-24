'use server';

/**
 * Marketing & acquisition server actions (Phase D Lot 1): promo codes, abandoned
 * carts, referral programme, manual credits. Mutations are gated on `users.act`
 * (admin + super-admin) and audited inside the data layer. `validatePromoAction`
 * is PUBLIC (no side effect) — it's called from the public checkout to preview a
 * discount, like `submitReviewAction` is called from the public review form.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { resolveAdminRole } from '@/lib/admin/access';
import { can } from '@/lib/admin/permissions';
import {
  createPromoCode,
  setPromoActive,
  deletePromoCode,
  isPromoCodeFree,
  validatePromo,
  redeemPromo,
  markCartAbandoned,
  remindCart,
  setReferralCredit,
  addManualCredit,
  type AdminActor,
  type DiscountType,
  type PromoAppliesTo,
  type ProductType,
  type PromoValidation,
} from '@/lib/admin/data';

export type MktResult = { ok: boolean; message?: string; code?: string };

async function requireUsersAct(): Promise<AdminActor> {
  const { userId } = await auth();
  if (!userId) throw new Error('unauthorized');
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = resolveAdminRole(user);
  if (!role || !can(role, 'users.act')) throw new Error('forbidden');
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.emailAddresses[0]?.emailAddress ||
    userId;
  return { id: userId, name };
}
function fail(e: unknown): MktResult {
  return { ok: false, message: e instanceof Error ? e.message : 'error' };
}

/* ------------------------------ promo codes ------------------------------ */
export type CreatePromoInput = {
  code: string;
  discountType: DiscountType;
  /** percent: 1–100. fixed: whole USD (converted to cents here). */
  discountValue: number;
  appliesTo: PromoAppliesTo;
  courseSlug: string | null;
  maxUses: number | null;
  expiresAt: string | null;
  startsAt: string | null;
  isActive: boolean;
};

export async function createPromoCodeAction(input: CreatePromoInput): Promise<MktResult> {
  try {
    const admin = await requireUsersAct();
    const value =
      input.discountType === 'fixed' ? Math.round(input.discountValue * 100) : Math.round(input.discountValue);
    return await createPromoCode({
      input: {
        code: input.code,
        discountType: input.discountType,
        discountValue: value,
        appliesTo: input.appliesTo,
        courseSlug: input.courseSlug,
        maxUses: input.maxUses,
        expiresAt: input.expiresAt,
        startsAt: input.startsAt,
        isActive: input.isActive,
      },
      admin,
    });
  } catch (e) {
    return fail(e);
  }
}

/** Live uniqueness check for the create form (read-only). */
export async function checkPromoFreeAction(code: string): Promise<{ free: boolean }> {
  try {
    await requireUsersAct();
    return { free: await isPromoCodeFree(code) };
  } catch {
    return { free: false };
  }
}

export async function setPromoActiveAction(id: string, active: boolean): Promise<MktResult> {
  try {
    const admin = await requireUsersAct();
    await setPromoActive({ id, active, admin });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePromoCodeAction(id: string): Promise<MktResult> {
  try {
    const admin = await requireUsersAct();
    return await deletePromoCode({ id, admin });
  } catch (e) {
    return fail(e);
  }
}

/** PUBLIC — preview a discount at checkout. No auth, no side effect. */
export async function validatePromoAction(p: {
  code: string;
  productType: ProductType;
  courseSlug: string | null;
  grossCents: number;
}): Promise<PromoValidation> {
  return validatePromo(p);
}

/** MOCK testing aid — stands in for real checkout completion until payments are
 *  wired. Records a redemption so the full loop is verifiable now (Task 10). */
export async function simulateRedemptionAction(code: string, userId: string): Promise<MktResult> {
  try {
    const admin = await requireUsersAct();
    return await redeemPromo({ code, userId, admin });
  } catch (e) {
    return fail(e);
  }
}

/* ---------------------------- abandoned carts ---------------------------- */
/** Sim of the 2h cron — flips a started session to abandoned without waiting. */
export async function markCartAbandonedAction(id: string): Promise<MktResult> {
  try {
    const admin = await requireUsersAct();
    await markCartAbandoned({ id, admin });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function remindCartAction(id: string): Promise<MktResult> {
  try {
    const admin = await requireUsersAct();
    return await remindCart({ id, admin });
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- referrals ------------------------------- */
export async function setReferralCreditAction(usd: number): Promise<MktResult> {
  try {
    const admin = await requireUsersAct();
    if (!Number.isFinite(usd) || usd < 0) return { ok: false, message: 'invalid' };
    await setReferralCredit({ cents: Math.round(usd * 100), admin });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addManualCreditAction(userId: string, usd: number, note: string): Promise<MktResult> {
  try {
    const admin = await requireUsersAct();
    if (!Number.isFinite(usd) || usd === 0) return { ok: false, message: 'invalid' };
    await addManualCredit({ userId, amountCents: Math.round(usd * 100), note: note.trim(), admin });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
