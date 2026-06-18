import { getTranslations } from 'next-intl/server';
import { IconCheck } from '@tabler/icons-react';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Sceau } from '@/components/ui/Sceau';

export async function Founder() {
  const t = await getTranslations('home.founder');
  const points = t.raw('points') as string[];

  return (
    <Section>
      <Container>
        <div className="grid items-center gap-10 md:grid-cols-[0.9fr_1.1fr]">
          <div className="order-2 md:order-1">
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-ink/10 bg-ink">
              <div
                aria-hidden
                className="route-thread absolute left-10 top-0 h-full w-px opacity-40"
              />
              <div
                aria-hidden
                className="route-thread absolute right-10 top-0 h-full w-px opacity-40"
              />
              <Sceau size="lg" tone="ochre" rotate={-6}>
                <span className="font-display text-3xl font-black leading-none">
                  PA
                </span>
                <span className="mt-1 text-[9px] tracking-[0.16em]">shipping</span>
              </Sceau>
              <span className="absolute bottom-3 left-4 font-mono text-[11px] text-paper-light/45">
                PNICE Shipping · Miami ⇄ Ayiti
              </span>
            </div>
          </div>

          <div className="order-1 md:order-2">
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
          </div>
        </div>
      </Container>
    </Section>
  );
}
