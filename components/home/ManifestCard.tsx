'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { Sceau } from '@/components/ui/Sceau';
import { Stamp } from '@/components/ui/Stamp';
import { Price, PriceSecondary } from '@/components/ui/Price';

export type ManifestRow = {
  code: string;
  title: string;
  priceUsd: number;
};

type ManifestCardProps = {
  /** Real catalog entries (first N courses), already localized. */
  rows: ManifestRow[];
  labels: {
    docTitle: string;
    docNo: string;
    colCode: string;
    colItem: string;
    colPrice: string;
    /** Footer row text, e.g. « +4 lòt fòmasyon ». */
    more: string;
    /** Bottom word inside the seal, e.g. « Ofisyèl ». */
    sealBottom: string;
  };
};

/** sessionStorage flag: the sequence plays once per visit, not on every navigation. */
const PLAYED_KEY = 'pa:hero-manifest-stamped';
/** Row entrance stagger (~60ms apart per PART A3). */
const ROW_STAGGER_MS = 60;
/** The seal lands as the last rows settle — whole sequence stays under 900ms. */
const STAMP_DELAY_MS = 440;

/**
 * « Le manifeste vivant » — the homepage signature (PART A3). A rendered
 * cargo-manifest document listing real catalog entries. On first visit the
 * rows fade in staggered (60ms apart), then the ochre seal stamps down onto
 * the corner via the shared `Stamp` gesture. Repeat navigations within the
 * session — and reduced-motion users (CSS-enforced) — see the final,
 * settled document instantly.
 */
export function ManifestCard({ rows, labels }: ManifestCardProps) {
  const [phase, setPhase] = useState<'idle' | 'play' | 'done'>('idle');
  /* Guards against React StrictMode's double-invoked mount effect: without
     it, the first invocation would flag the session as "played" and the
     second invocation would read that flag back, so the sequence never
     plays in dev. */
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let played = false;
    try {
      played = sessionStorage.getItem(PLAYED_KEY) === '1';
      if (!played) sessionStorage.setItem(PLAYED_KEY, '1');
    } catch {
      /* storage unavailable — just play the sequence */
    }
    setPhase(played ? 'done' : 'play');
  }, []);

  const gridCols = 'grid grid-cols-[3.25rem_1fr_auto] gap-x-3';

  return (
    <div
      className={cn(
        'relative',
        phase === 'play' && 'manifest-play',
        phase === 'done' && 'manifest-done',
      )}
    >
      {/* No-JS visitors read the full document, without theatre. */}
      <noscript>
        <style>{`.manifest-row{opacity:1 !important;transform:none !important}.stamp{opacity:1 !important;transform:scale(1) rotate(var(--stamp-rot,-8deg)) !important}`}</style>
      </noscript>

      <div className="rounded-md border border-ink/15 bg-paper shadow-[0_28px_56px_-28px_rgba(16,32,74,0.35)]">
        {/* document header */}
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 pb-3 pt-5 font-mono uppercase md:px-6">
          <span className="text-[11px] font-medium tracking-[0.18em] text-ink md:text-xs">
            {labels.docTitle}
          </span>
          <span className="whitespace-nowrap text-[11px] tracking-[0.14em] text-ink/55 md:text-xs">
            {labels.docNo}
          </span>
        </header>

        {/* double rule, like a printed form */}
        <div aria-hidden="true" className="px-5 md:px-6">
          <div className="border-t-2 border-ink/80" />
          <div className="mt-[3px] border-t border-ink/25" />
        </div>

        {/* column heads */}
        <div
          aria-hidden="true"
          className={cn(
            gridCols,
            'px-5 pb-2 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/45 md:px-6',
          )}
        >
          <span>{labels.colCode}</span>
          <span>{labels.colItem}</span>
          <span className="text-right">{labels.colPrice}</span>
        </div>

        {/* cargo rows — the real catalog */}
        <ul className="px-5 md:px-6">
          {rows.map((row, i) => (
            <li
              key={row.code}
              className={cn('manifest-row border-t border-ink/10 py-2.5', gridCols)}
              style={
                { '--row-delay': `${ROW_STAGGER_MS * (i + 1)}ms` } as React.CSSProperties
              }
            >
              <span className="pt-0.5 font-mono text-[11px] text-ink/55">
                <span className="sr-only">{labels.colCode}: </span>
                {row.code}
              </span>
              <span className="text-sm font-medium leading-snug text-ink">
                <span className="sr-only">{labels.colItem}: </span>
                {row.title}
              </span>
              <span className="text-right">
                <span className="sr-only">{labels.colPrice}: </span>
                <Price
                  usd={row.priceUsd}
                  className="block font-mono text-sm font-semibold text-ink"
                />
                <PriceSecondary
                  usd={row.priceUsd}
                  className="block font-mono text-[10px] leading-tight text-ink/45"
                />
              </span>
            </li>
          ))}
        </ul>

        {/* footer row → full catalog */}
        <div
          className="manifest-row border-t border-ink/10"
          style={
            {
              '--row-delay': `${ROW_STAGGER_MS * (rows.length + 1)}ms`,
            } as React.CSSProperties
          }
        >
          <Link
            href="/formations"
            className="group flex items-center gap-2 px-5 py-3.5 font-mono text-xs uppercase tracking-[0.12em] text-teal transition-colors hover:text-ink md:px-6"
          >
            <span>{labels.more}</span>
            <span
              aria-hidden="true"
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            >
              →
            </span>
          </Link>
        </div>
      </div>

      {/* the seal — lands last, astride the document's bottom-right corner */}
      <div className="pointer-events-none absolute -bottom-8 -right-3 md:-bottom-9 md:-right-5">
        <Stamp immediate rotate={-8} delay={phase === 'done' ? 0 : STAMP_DELAY_MS}>
          <Sceau size="md" rotate={0} tone="ochre">
            <span className="text-[8px] tracking-[0.22em]">PNICE Academy</span>
            <span className="my-0.5 font-display text-3xl font-black leading-none">
              PA
            </span>
            <span className="text-[8px] tracking-[0.22em]">{labels.sealBottom}</span>
          </Sceau>
        </Stamp>
      </div>
    </div>
  );
}
