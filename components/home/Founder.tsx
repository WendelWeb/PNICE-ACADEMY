import { getTranslations } from 'next-intl/server';
import { IconArrowRight, IconCheck } from '@tabler/icons-react';
import { Link } from '@/i18n/routing';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { CourseSlideshow } from '@/components/courses/CourseSlideshow';
import { siteImages } from '@/lib/courseImage';
import { teachers } from '@/data/teachers';

/**
 * « Moun ki dèyè platfòm nan » (Stage: the living manifest, section 7) —
 * the founder reframed to the marketplace truth: the platform's CREATOR and
 * its teacher #1, not "the" teacher. Same shipping-origin story, tightened;
 * the mono link at the end goes to the founder's own /prof page — the same
 * teacher sheet every other teacher gets, because the founder plays by the
 * marketplace's own rules.
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
            <Link
              href={`/prof/${teachers[0].slug}`}
              className="group mt-6 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-ink/60 transition-colors hover:text-ochre"
            >
              {t('profileLink')}
              <IconArrowRight
                size={14}
                className="transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </Link>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
