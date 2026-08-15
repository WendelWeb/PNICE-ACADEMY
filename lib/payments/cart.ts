/**
 * lib/payments/cart.ts — the pure rules of the « panye » (multi-course
 * wallet purchase). No IO here: everything is unit-testable arithmetic and
 * parsing, consumed by both wallet checkout routes and both settlements.
 */

/**
 * Ceiling on basket size. Not arbitrary: N courses = N provider-independent
 * fulfilments on one webhook (N payments rows, N enrollments, N teacher
 * shares, N receipt emails) inside a single serverless invocation — and the
 * wallets cap one payment at 75 000 HTG anyway, which a basket of ten
 * realistic course prices already brushes against.
 */
export const MAX_CART_ITEMS = 10;

/** Course-slug shape shared with checkout-body parsing. */
function isSlug(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 100;
}

/**
 * Pure — the distinct course slugs of a cart request, or null when the
 * payload is not a usable cart (empty, oversized, or malformed entries).
 * Duplicates collapse silently: "the same course twice" is never a thing a
 * buyer means, and refusing over it would only punish a double-tap.
 */
export function parseCartSlugs(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0 || raw.length > MAX_CART_ITEMS) return null;
  if (!raw.every(isSlug)) return null;
  const distinct = [...new Set(raw)];
  return distinct;
}

/**
 * Pure — splits the gourdes a wallet ACTUALLY charged for a whole basket
 * into one exact share per course, proportional to the courses' USD prices.
 *
 * WHY THIS EXISTS: the provider debits ONE total, but the books are kept per
 * course — each `payments` row freezes the real gourdes of ITS course
 * (`amount_htg`, the receipt's exact figure). Recomputing per-course gourdes
 * from a live FX rate at settlement time would disagree with what was
 * debited the moment the admin edits the rate; allocating the disclosed
 * total is the only split that always sums to the truth.
 *
 * Largest-remainder method: every share is a whole gourde, the shares sum to
 * EXACTLY `totalHtg` (no gourde invented, none lost), and each item with a
 * positive price gets at least 1. Degenerate inputs (empty list,
 * non-positive total, zero total price) yield an all-zero split — callers
 * treat that as "no exact figure known" and fall back to the estimate path,
 * same as a provider that disclosed nothing.
 */
export function allocateHtgShares(totalHtg: number, itemCents: number[]): number[] {
  const zeros = itemCents.map(() => 0);
  if (itemCents.length === 0) return zeros;
  if (!Number.isFinite(totalHtg) || totalHtg <= 0) return zeros;
  const totalCents = itemCents.reduce((a, c) => a + Math.max(0, c), 0);
  if (totalCents <= 0) return zeros;

  const total = Math.round(totalHtg);
  const raw = itemCents.map((c) => (total * Math.max(0, c)) / totalCents);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, v) => a + v, 0);

  // Hand the leftover gourdes to the largest fractional parts, one each —
  // deterministic tie-break by index so the same basket always splits the
  // same way.
  const order = raw
    .map((v, i) => ({ frac: v - Math.floor(v), i }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const shares = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    shares[i] += 1;
    remainder -= 1;
  }

  // A paid course must never book 0 gourdes while the basket paid something:
  // lift zero-share items (positive price, crushed by rounding) to 1, taking
  // the gourde from the largest share — totals stay exact.
  for (let i = 0; i < shares.length; i++) {
    if (itemCents[i] > 0 && shares[i] === 0) {
      const donor = shares.indexOf(Math.max(...shares));
      if (donor !== i && shares[donor] > 1) {
        shares[donor] -= 1;
        shares[i] += 1;
      }
    }
  }
  return shares;
}
