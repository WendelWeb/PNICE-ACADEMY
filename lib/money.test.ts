import { describe, it, expect } from 'vitest';
import { toHtg, toHtgAt, formatUsd, formatHtg, htgLabel, htgLabelAt, receiptHtgText, USD_TO_HTG } from './money';

describe('money', () => {
  it('converts usd to htg with the rate, rounded to the nearest 50', () => {
    expect(toHtg(0)).toBe(0);
    expect(toHtg(79)).toBe(Math.round((79 * USD_TO_HTG) / 50) * 50);
    expect(toHtg(79) % 50).toBe(0);
    expect(toHtg(10) % 50).toBe(0);
  });

  it('formats a usd amount with a dollar suffix', () => {
    expect(formatUsd(79)).toBe('79$');
    expect(formatUsd(9)).toBe('9$');
  });

  it('formats a gourdes amount with the HTG suffix', () => {
    expect(formatHtg(10450)).toMatch(/HTG$/);
  });

  it('htgLabel derives a HTG label from a usd amount', () => {
    expect(htgLabel(79)).toMatch(/HTG$/);
    expect(htgLabel(79)).toBe(formatHtg(toHtg(79)));
  });

  it('toHtgAt converts at an explicit rate, rounded to the nearest 50 (fix/fx-rate-unify)', () => {
    expect(toHtgAt(0, 140)).toBe(0);
    expect(toHtgAt(79, 140)).toBe(Math.round((79 * 140) / 50) * 50);
    expect(toHtgAt(79, 140) % 50).toBe(0);
    // Different explicit rates produce different amounts — proves the rate
    // argument, not USD_TO_HTG, drives the conversion.
    expect(toHtgAt(79, 140)).not.toBe(toHtgAt(79, 132));
    // toHtg (env-default) matches toHtgAt at USD_TO_HTG exactly.
    expect(toHtg(79)).toBe(toHtgAt(79, USD_TO_HTG));
  });

  it('htgLabelAt derives a HTG label at an explicit rate', () => {
    expect(htgLabelAt(79, 140)).toMatch(/HTG$/);
    expect(htgLabelAt(79, 140)).toBe(formatHtg(toHtgAt(79, 140)));
    expect(htgLabel(79)).toBe(htgLabelAt(79, USD_TO_HTG));
  });

  describe('receiptHtgText (Stage 2 money-exactness pass)', () => {
    // The exact real-world regression this guards against: the one live
    // MonCash sale (course $2.00, checkout at fx_rate_htg=132) that MonCash
    // actually charged 264 HTG for (usdCentsToHtg(200, 132) — round-to-
    // nearest-1), while the OLD receipt logic re-derived toHtgAt(2, rate)
    // (round-to-nearest-50) at whatever rate was live when the receipt was
    // rendered — 250 HTG at the sale-time rate, and STILL 250 HTG (not the
    // real 264) even after an admin later moved the rate to 135.
    it('shows the REAL charged amount, exactly, ignoring the USD price entirely', () => {
      const text = receiptHtgText(264, 200, 132);
      expect(text).toBe(formatHtg(264));
      expect(text).not.toBe(htgLabelAt(2, 132)); // the old (wrong) derivation
    });

    it('is frozen: a live rate that changed AFTER the sale has zero effect once a real amount is stored', () => {
      const atSaleTime = receiptHtgText(264, 200, 132);
      const afterAnAdminRateChange = receiptHtgText(264, 200, 135);
      expect(afterAnAdminRateChange).toBe(atSaleTime);
      expect(afterAnAdminRateChange).toBe(formatHtg(264));
    });

    it('rounds a fractional stored amount to the nearest whole gourde', () => {
      expect(receiptHtgText(263.6, 200, 132)).toBe(formatHtg(264));
      expect(receiptHtgText(263.4, 200, 132)).toBe(formatHtg(263));
    });

    it.each([null, undefined, 0, -1, Number.NaN])(
      'falls back to a live-rate ESTIMATE when no real amount is stored (%p)',
      (stored) => {
        expect(receiptHtgText(stored as number | null | undefined, 200, 132)).toBe(htgLabelAt(2, 132));
      },
    );
  });
});
