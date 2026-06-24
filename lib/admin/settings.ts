/**
 * Admin-editable settings (mock store).
 *
 * The USD→HTG rate is the single source of truth for the admin section's gourdes
 * figures. It starts from the env default (lib/money) and can be updated live by
 * an admin (Lot 3 Task 5). In-memory for now — persists for the server-process
 * lifetime; a DB-backed setting (read by the public checkout too) lands in Phase B.
 */
import { USD_TO_HTG } from '@/lib/money';

let fxRate = USD_TO_HTG;
let fxUpdatedAt = new Date().toISOString();

export function getFxRate(): { rate: number; updatedAt: string } {
  return { rate: fxRate, updatedAt: fxUpdatedAt };
}

export function setFxRate(rate: number): void {
  fxRate = rate;
  fxUpdatedAt = new Date().toISOString();
}

/** Convert USD cents to gourdes at the live admin rate, rounded to nearest 50. */
export function htgFromCentsAt(cents: number, rate: number): number {
  return Math.round(((cents / 100) * rate) / 50) * 50;
}
