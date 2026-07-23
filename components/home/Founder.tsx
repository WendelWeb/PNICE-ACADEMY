import { getTranslations } from 'next-intl/server';
import { IconCheck } from '@tabler/icons-react';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { CourseSlideshow } from '@/components/courses/CourseSlideshow';
import { siteImages } from '@/lib/courseImage';

/**
 * « Istwa nou » — reframed from a personal-app story into the institution's
 * origin story (U3/A2): why PNICE Academy exists, not who runs it. The
 * slideshow merges the old hero photos (now unused since U2's manifest hero)
 * with the founder gallery, so the frame spans shipping → digital skills —
 * the same arc the copy tells.
 */
export async function Founder() {
  const t = await getTranslations('home.founder');
  const points = t.raw('points') as string[];
  const images = [...siteImages('founder'), ...siteImages('hero')];

  return (
    <Section>
      <Container>
        <div className="grid items-center gap-10 md:grid-cols-[0.9fr_1.1fr]">
          <Reveal className="order-2 md:order-1">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-ink/10 bg-ink">
              <CourseSlideshow
                images={images}
                alt="PNICE Shipping — koneksyon ant Miami ak Ayiti"
                sizes="(max-width: 768px) 100vw, 45vw"
              />
              <span className="absolute bottom-3 left-4 rounded bg-ink/55 px-2 py-1 font-mono text-[11px] text-paper-light/80 backdrop-blur-sm">
                {t('imgCaption')}
              </span>
            </div>
          </Reveal>

          <Reveal delay={90} className="order-1 md:order-2">
            <Eyebrow>{t('eyebrow')}</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
              {t('title')}
            </h2>
            <p className="mt-4 leading-relaxed text-graphite">{t('body')}</p>
            <ul className="mt-6 space-y-3">
              {points.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <IconCheck size={20} className="mt-0.5 shrink-0 text-teal" />
                  <span className="text-graphite">{p}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
