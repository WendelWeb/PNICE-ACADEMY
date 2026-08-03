import { redirect } from 'next/navigation';

/**
 * `/temoignage` (Stage 4) — a guessable URL that used to 404 unbranded.
 * Real testimonial submission lives at /temoignage/[token] (invite-only);
 * the bare path lands on the home page's testimonials section (`#temwayaj`
 * — see components/home/Testimonials.tsx). If no testimonials are published
 * yet the anchor simply doesn't exist and the visitor lands at the top of
 * the home page — still branded, never a 404.
 */
export default function TemoignageIndex({
  params: { locale },
}: {
  params: { locale: string };
}) {
  redirect(`/${locale}#temwayaj`);
}
