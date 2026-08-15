/**
 * The « panye » arithmetic is money: the sum of the per-course gourde shares
 * MUST equal what the wallet actually debited — a gourde invented or lost in
 * the split is a bookkeeping lie multiplied by every basket sold.
 */
import { describe, it, expect } from 'vitest';
import { allocateHtgShares, parseCartSlugs, MAX_CART_ITEMS } from './cart';

describe('allocateHtgShares — exact, proportional, conservative', () => {
  it('splits proportionally and sums EXACTLY to the charged total', () => {
    // $2 + $9 + $24 charged 4 725 HTG total (135 rate): shares must rebuild it.
    const shares = allocateHtgShares(4725, [200, 900, 2400]);
    expect(shares.reduce((a, v) => a + v, 0)).toBe(4725);
    expect(shares).toEqual([270, 1215, 3240]); // clean case: exact thirds of the rate
  });

  it('never invents nor loses a gourde on awkward totals', () => {
    for (const total of [1001, 999, 100, 7, 75000]) {
      for (const cents of [[200, 900], [199, 301, 500], [100, 100, 100]]) {
        const shares = allocateHtgShares(total, cents);
        expect(shares.reduce((a, v) => a + v, 0)).toBe(total);
      }
    }
  });

  it('gives every positively-priced course at least 1 gourde', () => {
    const shares = allocateHtgShares(100, [1, 9999]);
    expect(shares[0]).toBeGreaterThanOrEqual(1);
    expect(shares.reduce((a, v) => a + v, 0)).toBe(100);
  });

  it('is deterministic — the same basket always splits the same way', () => {
    const a = allocateHtgShares(1000, [333, 333, 333]);
    const b = allocateHtgShares(1000, [333, 333, 333]);
    expect(a).toEqual(b);
    expect(a.reduce((x, v) => x + v, 0)).toBe(1000);
  });

  it('answers all-zero for degenerate input — the "no exact figure" signal', () => {
    expect(allocateHtgShares(0, [200, 900])).toEqual([0, 0]);
    expect(allocateHtgShares(-5, [200])).toEqual([0]);
    expect(allocateHtgShares(Number.NaN, [200])).toEqual([0]);
    expect(allocateHtgShares(500, [])).toEqual([]);
    expect(allocateHtgShares(500, [0, 0])).toEqual([0, 0]);
  });
});

describe('parseCartSlugs', () => {
  it('accepts a plain list of slugs', () => {
    expect(parseCartSlugs(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('collapses duplicates instead of refusing a double-tap', () => {
    expect(parseCartSlugs(['a', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('refuses empty, oversized and malformed payloads', () => {
    expect(parseCartSlugs([])).toBeNull();
    expect(parseCartSlugs(Array.from({ length: MAX_CART_ITEMS + 1 }, (_, i) => `c${i}`))).toBeNull();
    expect(parseCartSlugs(['a', 42])).toBeNull();
    expect(parseCartSlugs('a')).toBeNull();
    expect(parseCartSlugs(null)).toBeNull();
    expect(parseCartSlugs(['x'.repeat(101)])).toBeNull();
  });
});
