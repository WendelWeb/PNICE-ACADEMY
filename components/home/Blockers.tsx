import { getTranslations } from 'next-intl/server';
import { Section, Container, Eyebrow } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';

export async function Blockers() {
  const t = await getTranslations('home.blockers');
  const items = t.raw('items') as { title: string; text: string }[];

  return (
    <Section className="bg-paper">
      <Container>
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-extrabold leading-tight text-ink md:text-4xl">
          {t('title')}
        </h2>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={i} delay={i * 70}>
              <div className="h-full rounded-lg border border-ink/10 bg-paper-light p-6">
                <span className="font-mono text-sm font-semibold text-stampred">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 font-display text-xl font-bold text-ink">
                  {it.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite/80">
                  {it.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
