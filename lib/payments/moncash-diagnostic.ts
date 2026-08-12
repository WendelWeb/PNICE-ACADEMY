'use server';

/**
 * Owner-only MonCash diagnostic actions, for /admin/moncash.
 *
 * WHY THIS EXISTS: MonCash's sandbox currently refuses every write with
 * `403 "MFS can't process this transaction"` while accepting reads, and no
 * amount of code inspection can tell us whether that is a sandbox
 * provisioning gap or something about a specific wallet. Only a real cash-out
 * request to a real handset settles it — so this page lets the owner fire one
 * at their own number and see MonCash's raw answer at each step.
 *
 * IT IS NOT A CHECKOUT. Nothing here grants course access, records a payment,
 * or touches the ledger. It is a probe: initiate, then look. That separation
 * is deliberate — a diagnostic that could also grant access would be a
 * standing temptation to use it as a back door.
 *
 * SECURITY: both actions re-check the `roles.manage` capability themselves
 * rather than trusting the page's own gate. This endpoint can push a payment
 * prompt to any phone number, which in the wrong hands is a harassment tool,
 * so it must never be reachable by a non-owner even if a page were ever
 * mis-wired. It is also gated on MonCash being configured at all.
 */
import { hasCap } from '@/lib/admin/guard';
import {
  moncashConfigured,
  moncashMode,
  moncashHost,
  normalizeHaitianMsisdn,
  initiateMoncashPayment,
  checkMoncashPaymentByReference,
} from '@/lib/payments/moncash';

export type DiagResult = {
  ok: boolean;
  /** Short machine reason, shown verbatim so nothing is lost in translation. */
  detail: string;
  /** What we sent, so the owner can quote it to Digicel support. */
  sent?: { reference: string; account: string; amountHtg: number; host: string; mode: string };
  /** Parsed status, when MonCash answered a check. */
  status?: {
    paid: boolean;
    pending: boolean;
    message: string;
    transactionId: string | null;
    amountHtg: number | null;
  };
};

async function guard(): Promise<DiagResult | null> {
  if (!(await hasCap('roles.manage'))) return { ok: false, detail: 'forbidden' };
  if (!moncashConfigured()) return { ok: false, detail: 'not_configured' };
  return null;
}

/**
 * Pushes a real cash-out request to `phone`. In sandbox that costs nothing; in
 * live mode this really asks that person for money, which is exactly why the
 * page states the mode in large type before the button.
 */
export async function moncashProbeAction(input: {
  phone: string;
  amountHtg: number;
}): Promise<DiagResult> {
  const denied = await guard();
  if (denied) return denied;

  const account = normalizeHaitianMsisdn(input.phone);
  if (!account) return { ok: false, detail: 'bad_phone' };

  const amountHtg = Math.round(Number(input.amountHtg));
  if (!Number.isFinite(amountHtg) || amountHtg <= 0) return { ok: false, detail: 'bad_amount' };

  // A fresh, unambiguous reference every run — reusing one would make a later
  // CheckPayment ambiguous about which attempt it is reporting on.
  const reference = `diag-${Date.now()}`;
  const sent = { reference, account, amountHtg, host: moncashHost(), mode: moncashMode() };

  const started = await initiateMoncashPayment({ reference, account, amountHtg });
  if (!started.ok) return { ok: false, detail: started.message, sent };

  return { ok: true, detail: started.message || 'pending', sent };
}

/** Asks MonCash what became of a probe — the buyer approves on their handset. */
export async function moncashCheckAction(reference: string): Promise<DiagResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!reference.trim()) return { ok: false, detail: 'bad_reference' };

  const r = await checkMoncashPaymentByReference(reference.trim());
  if (!r.ok) return { ok: false, detail: r.message };

  return {
    ok: true,
    detail: r.message || 'unknown',
    status: {
      paid: r.paid,
      pending: r.pending,
      message: r.message,
      transactionId: r.transactionId,
      amountHtg: r.amountHtg,
    },
  };
}
