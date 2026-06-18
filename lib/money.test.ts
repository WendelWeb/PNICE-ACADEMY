import { describe, it, expect } from 'vitest';
import { toHtg, formatUsd, formatHtg, htgLabel, USD_TO_HTG } from './money';

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
});
