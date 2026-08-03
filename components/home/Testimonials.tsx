import { getLocale, getTranslations } from 'next-intl/server';
import { IconQuote } from '@tabler/icons-react';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { SmartImage } from '@/components/ui/SmartImage';
import { siteImageSrc } from '@/lib/courseImage';
import { getHomeTestimonials } from '@/lib/admin/site/ops';

/**
 * Testimonials (Stage: the living manifest, section 8) — ONLY real,
 * PUBLISHED testimonials from the DB-backed store ever render here; zero
 * published ⇒ the whole section renders nothing. The placeholder personas
 * that used to ship on the public path are gone for good (they remain
 * admin-only examples in /admin/temoignages).
 */
export async function Testimonials() {
  const t = await getTranslations('home.testimonials');
  const locale = await getLocale();
  const testimonials = await getHomeTestimonials();
  if (testimonials.length === 0) return null;

  return (
    <Section className="bg-paper">
      <Container>
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h2 className="mt-3 font-display text-3xl font-extrabold text-ink md:text-4xl">
          {t('title')}
        </h2>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {testimonials.map((tm, i) => (
            <Reveal key={tm.id} delay={i * 70}>
              <figure className="h-full rounded-lg border border-ink/10 bg-paper-light p-6">
                <IconQuote size={22} className="text-ochre" />
                <blockquote className="mt-3 text-[15px] leading-relaxed text-graphite">
                  {locale === 'ht' ? tm.quote_ht : tm.quote_fr}
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  {tm.photo ? (
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-ink/10 bg-paper">
                      <SmartImage
                        src={tm.photo.startsWith('http') ? tm.photo : siteImageSrc(tm.photo)}
                        alt={tm.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    </span>
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/10 font-mono text-sm text-ink/60">
                      {tm.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="font-mono text-xs text-ink/60">
                    {tm.name}
                    {tm.location ? ` · ${tm.location}` : ''}
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
