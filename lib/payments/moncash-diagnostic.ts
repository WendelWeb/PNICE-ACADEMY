'use server';

/**
 * Owner-only MonCash diagnostic actions, for /admin/moncash.
 *
 * WHY THIS EXISTS: Digicel ships two different MonCash APIs under one brand,
 * and a merchant account is provisioned for one or the other with no way to
 * tell from the outside. Ours turned out to be the "Payment Button" API
 * (/Api/v1/CreatePayment + a hosted gateway page), while the Merchant API
 * (/MerChantApi, cash-out straight to a handset) answers
 * `403 MFS can't process this transaction` for the same credentials. This
 * page is how that was established, and how a future change is re-established
 * in a minute instead of a day.
 *
 * IT IS NOT A CHECKOUT. It creates a MonCash order and hands back the payment
 * link, but grants no course access, records no payment, and never touches the
 * ledger. That separation is deliberate — a diagnostic that could also grant
 * access would be a standing temptation to use as a back door.
 *
 * SECURITY: every action re-checks the `roles.manage` capability itself rather
 * than trusting the page's gate, and is additionally gated on MonCash being
 * configured at all.
 */
import { hasCap } from '@/lib/admin/guard';
import {
  moncashConfigured,
  moncashMode,
  moncashHost,
  createMoncashOrder,
  retrieveMoncashOrder,
} from '@/lib/payments/moncash';

export type DiagResult = {
  ok: boolean;
  /** Short machine reason, shown verbatim so nothing is lost in translation. */
  detail: string;
  /** The MonCash page to pay on — the whole point of the probe. */
  payUrl?: string;
  /** What we sent, so the owner can quote it to Digicel support. */
  sent?: { orderId: string; amountHtg: number; host: string; mode: string };
  /** Parsed status, when MonCash answered a lookup. */
  status?: {
    paid: boolean;
    message: string;
    transactionId: string | null;
    amountHtg: number | null;
    payer: string | null;
  };
};

async function guard(): Promise<DiagResult | null> {
  if (!(await hasCap('roles.manage'))) return { ok: false, detail: 'forbidden' };
  if (!moncashConfigured()) return { ok: false, detail: 'not_configured' };
  return null;
}

/**
 * Creates a real MonCash order and returns its payment link. In sandbox that
 * link takes fake money; in live mode it takes real money from whoever opens
 * it, which is why the page states the mode in large type before the button.
 */
export async function moncashProbeAction(input: { amountHtg: number }): Promise<DiagResult> {
  const denied = await guard();
  if (denied) return denied;

  const amountHtg = Math.round(Number(input.amountHtg));
  if (!Number.isFinite(amountHtg) || amountHtg <= 0) return { ok: false, detail: 'bad_amount' };

  // A fresh reference every run — reusing one would make a later lookup
  // ambiguous about which attempt it is reporting on.
  const orderId = `diag-${Date.now()}`;
  const sent = { orderId, amountHtg, host: moncashHost(), mode: moncashMode() };

  const created = await createMoncashOrder({ orderId, amountHtg });
  if (!created.ok) return { ok: false, detail: created.message, sent };

  return { ok: true, detail: 'order_created', payUrl: created.redirectUrl, sent };
}

/** Asks MonCash what became of a probe, after the owner paid on the gateway. */
export async function moncashCheckAction(orderId: string): Promise<DiagResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!orderId.trim()) return { ok: false, detail: 'bad_order_id' };

  const r = await retrieveMoncashOrder(orderId.trim());
  if (!r.ok) return { ok: false, detail: r.message };

  return {
    ok: true,
    detail: r.paid ? 'successful' : 'not_paid_yet',
    status: {
      paid: r.paid,
      message: r.paid ? 'successful' : 'pas encore payé',
      transactionId: r.transactionId,
      amountHtg: r.costHtg,
      payer: r.payer,
    },
  };
}
