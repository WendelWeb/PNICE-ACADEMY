import { describe, it, expect } from 'vitest';
import { toHtg, toHtgAt, formatUsd, formatHtg, htgLabel, htgLabelAt, USD_TO_HTG } from './money';

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
});
