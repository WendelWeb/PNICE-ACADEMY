/**
 * GET /api/certificate/[code] — public certificate PDF download (Task L3).
 *
 * Deliberately outside the `[locale]` route tree (like every other route
 * under app/api/): the certificate PDF isn't a localized page, it's a file.
 * Locale is instead an optional `?locale=fr|ht` query param (defaults `ht`,
 * mirroring the plan's binding default), read off the SAME data source the
 * public verify page uses (`getCertificateByCode`) so the two never disagree
 * about whether a code is valid/revoked.
 *
 * `courseTitle_ht`/`courseTitle_fr` on `CertVerification` are already
 * resolved from data/courses.ts inside the data layer (see
 * lib/admin/data/mock/index.ts's `courseBySlug`), so reusing them here (as
 * the verify page does) avoids a second, potentially-drifting lookup.
 *
 * No DATABASE_URL / no keys needed: this only depends on the admin data
 * layer (mock fallback) and the pure `buildCertificatePdf` — works before
 * any external service is configured.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCertificateByCode } from '@/lib/admin/data';
import { buildCertificatePdf } from '@/lib/pdf/certificate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Locale = 'ht' | 'fr';

function resolveLocale(value: string | null): Locale {
  return value === 'fr' ? 'fr' : 'ht';
}

/** Filenames only ever need to be readable + header-safe — strip anything
 *  outside a conservative allowlist rather than trust the stored code as-is. */
function safeFilenameSegment(code: string): string {
  const cleaned = code.replace(/[^A-Za-z0-9_-]/g, '_');
  return cleaned || 'certificate';
}

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  let code: string;
  try {
    code = decodeURIComponent(params.code ?? '');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!code.trim()) return new NextResponse('Not found', { status: 404 });

  const verification = await getCertificateByCode(code).catch((err) => {
    console.error('[api/certificate] lookup failed:', err);
    return null;
  });
  if (!verification || !verification.found || verification.revoked) {
    return new NextResponse('Not found', { status: 404 });
  }

  const locale = resolveLocale(req.nextUrl.searchParams.get('locale'));
  const courseTitle =
    (locale === 'fr' ? verification.courseTitle_fr : verification.courseTitle_ht) ??
    verification.courseTitle_ht ??
    verification.courseTitle_fr ??
    '—';
  const issuedDate = verification.issuedAt
    ? new Date(verification.issuedAt).toLocaleDateString(locale === 'ht' ? 'fr' : locale, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';
  const verifyUrl = `${req.nextUrl.origin}/${locale}/certificats/verifier/${encodeURIComponent(verification.code)}`;

  try {
    const pdfBytes = await buildCertificatePdf({
      recipientName: verification.userName ?? '—',
      courseTitle,
      verificationCode: verification.code,
      issuedDate,
      verifyUrl,
      locale,
    });
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="pnice-certificate-${safeFilenameSegment(verification.code)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    // A rendering bug must never look like "this certificate doesn't exist" —
    // 500, not 404, so it's distinguishable in logs/monitoring.
    console.error('[api/certificate] pdf build failed:', err);
    return new NextResponse('Internal error', { status: 500 });
  }
}
