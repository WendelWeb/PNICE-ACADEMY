import { getLocale, getTranslations } from 'next-intl/server';
import { IconQuote } from '@tabler/icons-react';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { SmartImage } from '@/components/ui/SmartImage';
import { siteImageSrc } from '@/lib/courseImage';
import { testimonials } from '@/data/testimonials';

export async function Testimonials() {
  const t = await getTranslations('home.testimonials');
  const locale = await getLocale();

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
              <figure className="relative h-full rounded-lg border border-ink/10 bg-paper-light p-6">
                <span className="absolute right-4 top-4 rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/45">
                  {t('exampleTag')}
                </span>
                <IconQuote size={22} className="text-ochre" />
                <blockquote className="mt-3 text-[15px] leading-relaxed text-graphite">
                  {locale === 'ht' ? tm.quote_ht : tm.quote_fr}
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-ink/10 bg-paper">
                    <SmartImage
                      src={siteImageSrc(tm.avatar)}
                      alt={tm.name}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </span>
                  <span className="font-mono text-xs text-ink/60">
                    {tm.name} · {tm.location}
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        <p className="mt-5 font-mono text-[11px] text-graphite/55">{t('note')}</p>
      </Container>
    </Section>
  );
}
