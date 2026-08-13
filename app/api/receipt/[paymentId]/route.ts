/**
 * GET /api/receipt/[paymentId] — the signed-in learner downloads the PDF
 * receipt for one of their OWN payments (Stage: learner account). Until now
 * the receipt PDF existed only as an email attachment (lib/payments/
 * fulfill.ts); this route serves the SAME `buildReceiptPdf` output on
 * demand, so /kont's purchase history can link every row to its receipt.
 *
 * OWNER-ONLY: the payment row must belong to the signed-in learner's own
 * users.id — anyone else's payment id 404s (no existence leak). Env-gated
 * like every route here: no Clerk/DB ⇒ 404, degraded not broken.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { paymentsSelectSafe, PAYMENTS_COLUMNS_PRE_0019 } from '@/db/payments-compat';
import { clerkEnabled } from '@/lib/clerk';
import { resolveUserId } from '@/lib/learner/access';
import { getCourseBySlug } from '@/lib/courses/source';
import { getFxRate } from '@/lib/fx';
import { receiptHtgText } from '@/lib/money';
import { buildReceiptPdf } from '@/lib/pdf/receipt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const T = schema;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: { paymentId: string } }) {
  if (!clerkEnabled || !process.env.DATABASE_URL) {
    return new NextResponse('Not found', { status: 404 });
  }
  const paymentId = params.paymentId ?? '';
  if (!UUID_RE.test(paymentId)) return new NextResponse('Not found', { status: 404 });

  const { userId: clerkId } = await auth();
  if (!clerkId) return new NextResponse('Unauthorized', { status: 401 });

  try {
    const userId = await resolveUserId(clerkId);
    if (!userId) return new NextResponse('Not found', { status: 404 });

    const [payment] = await paymentsSelectSafe(
      () => db.select().from(T.payments).where(eq(T.payments.id, paymentId)).limit(1),
      () => db.select(PAYMENTS_COLUMNS_PRE_0019).from(T.payments).where(eq(T.payments.id, paymentId)).limit(1),
    );
    // Owner-only: a foreign payment behaves exactly like a missing one.
    if (!payment || payment.userId !== userId) return new NextResponse('Not found', { status: 404 });
    if (payment.status !== 'completed' && payment.status !== 'refunded') {
      return new NextResponse('Not found', { status: 404 });
    }

    const locale = req.nextUrl.searchParams.get('locale') === 'fr' ? 'fr' : 'ht';
    const [user] = await db
      .select({ name: T.users.name })
      .from(T.users)
      .where(eq(T.users.id, userId))
      .limit(1);

    const course = payment.courseSlug ? await getCourseBySlug(payment.courseSlug) : undefined;
    const itemName = course
      ? locale === 'fr'
        ? course.title_fr
        : course.title_ht
      : payment.courseSlug ?? (locale === 'fr' ? 'Abonnement mensuel' : 'Abònman chak mwa');

    // The gourdes actually charged, frozen at sale time (payments.amount_htg,
    // Stage 2 money-exactness pass) — never recomputed from a live FX rate
    // once it exists, so the PDF can't drift after an admin later moves the
    // rate. Only MonCash rows ever have it; everything else (Stripe, or a
    // MonCash row recorded before this column existed) falls back to the
    // same live-rate ESTIMATE as before (`receiptHtgText`, lib/money.ts).
    const ref = payment.providerRef ?? payment.id;
    const htgText = receiptHtgText(payment.amountHtg, payment.amountCents, await getFxRate());
    const pdfBytes = await buildReceiptPdf({
      name: user?.name ?? null,
      itemName,
      amountCents: payment.amountCents,
      currency: payment.currency,
      htgText,
      dateIso: payment.createdAt.toISOString(),
      ref,
      locale,
    });

    const safeRef = ref.replace(/[^A-Za-z0-9_-]/g, '_') || 'receipt';
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="pnice-receipt-${safeRef}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[api/receipt] failed:', err);
    return new NextResponse('Internal error', { status: 500 });
  }
}
