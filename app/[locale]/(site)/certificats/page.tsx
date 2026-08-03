import { redirect } from 'next/navigation';

/**
 * `/certificats` (Stage 4) — a guessable URL that used to 404 unbranded.
 * The verification tool is the only thing that lives under this segment, so
 * the bare path forwards there. Locale-prefixed, mirroring the redirect
 * pattern used across the studio pages.
 */
export default function CertificatsIndex({
  params: { locale },
}: {
  params: { locale: string };
}) {
  redirect(`/${locale}/certificats/verifier`);
}
