import { describe, it, expect } from 'vitest';
import { toHtgAt, formatUsd, formatHtg, htgLabelAt, receiptHtgText } from './money';
import { usdCentsToHtg } from './payments/moncash/types';

describe('money', () => {
  it('formats a usd amount with a dollar suffix', () => {
    expect(formatUsd(79)).toBe('79$');
    expect(formatUsd(9)).toBe('9$');
  });

  it('formats a gourdes amount with the HTG suffix', () => {
    expect(formatHtg(10450)).toMatch(/HTG$/);
  });

  it('toHtgAt converts at the given rate, EXACTLY — no 50-HTG bucket', () => {
    expect(toHtgAt(79, 140)).toBe(79 * 140);
    // Different explicit rates produce different amounts — proves the rate
    // argument, and nothing ambient, drives the conversion.
    expect(toHtgAt(79, 140)).not.toBe(toHtgAt(79, 132));
  });

  it('rejects nonsense instead of returning NaN', () => {
    expect(toHtgAt(0, 140)).toBe(0);
    expect(toHtgAt(-2, 140)).toBe(0);
    expect(toHtgAt(2, 0)).toBe(0);
    expect(toHtgAt(Number.NaN, 140)).toBe(0);
    expect(toHtgAt(2, Number.NaN)).toBe(0);
  });

  it('htgLabelAt derives a HTG label at an explicit rate', () => {
    expect(htgLabelAt(79, 140)).toMatch(/HTG$/);
    expect(htgLabelAt(79, 140)).toBe(formatHtg(toHtgAt(79, 140)));
  });

  /**
   * THE REGRESSION THE OWNER HIT: a $2 course displayed "~250 HTG" and
   * MonCash then charged 270. Two conversions of one price — the display
   * rounded to the nearest 50, the charge to the nearest gourde. They are
   * now the same function, so the site cannot advertise a figure it will
   * not charge.
   */
  it('displays exactly what MonCash charges, at any rate', () => {
    for (const rate of [132, 135, 141]) {
      for (const cents of [200, 900, 7900]) {
        expect(toHtgAt(cents / 100, rate)).toBe(usdCentsToHtg(cents, rate));
      }
    }
    // The owner's own numbers, spelled out: $2 at the 135 rate in Paramètres.
    expect(toHtgAt(2, 135)).toBe(270);
    expect(usdCentsToHtg(200, 135)).toBe(270);
  });

  describe('receiptHtgText (Stage 2 money-exactness pass)', () => {
    // The exact real-world regression this guards against: the one live
    // MonCash sale (course $2.00, checkout at fx_rate_htg=132) that MonCash
    // actually charged 264 HTG for, while the receipt re-derived the figure
    // at whatever rate was live when it was RENDERED. Since the owner moved
    // the rate to 135, that derivation says 270 — a receipt for a charge of
    // 264. The stored amount must win, whatever today's rate is.
    it('shows the REAL charged amount, exactly, ignoring the USD price entirely', () => {
      const text = receiptHtgText(264, 200, 135);
      expect(text).toBe(formatHtg(264));
      expect(text).not.toBe(htgLabelAt(2, 135)); // 270 — today's derivation
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
