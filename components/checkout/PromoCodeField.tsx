'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { IconTag, IconLoader2, IconX, IconCheck } from '@tabler/icons-react';
import { formatUsd } from '@/lib/money';
import { validatePromoAction } from '@/lib/admin/marketing-actions';
import type { ProductType, PromoValidation } from '@/lib/admin/data';
import { usePromoContext } from './promo-context';

/**
 * Public checkout promo field (Stage: checkout honesty — no longer a demo).
 * Validates a code against the concrete price and previews the discounted
 * total; the applied code is published to the checkout promo context so the
 * pay button sends it to /api/checkout, which RE-validates it server-side
 * and creates the Stripe session at the discounted amount. The redemption is
 * marked at real payment confirmation (lib/payments/promo-redemption.ts).
 */
export function PromoCodeField({
  productType,
  courseSlug,
  grossCents,
  productKind,
}: {
  productType: ProductType;
  courseSlug: string | null;
  grossCents: number;
  /** 'platform' | 'teacher' for a subscription purchase, `null` for a course
   *  — see lib/admin/data/types.ts's `validatePromo` doc comment for why a
   *  named teacher's own plan can never be promo-discounted this way. */
  productKind: 'teacher' | 'platform' | null;
}) {
  const t = useTranslations('checkout.promo');
  const [pending, start] = useTransition();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<PromoValidation | null>(null);
  const promo = usePromoContext();

  const apply = () =>
    start(async () => {
      const r = await validatePromoAction({ code: code.trim(), productType, courseSlug, grossCents, productKind });
      setResult(r);
      promo?.setApplied(
        r.valid
          ? {
              code: r.code,
              discountCents: r.discountCents ?? 0,
              netCents: r.netCents ?? grossCents,
            }
          : null,
      );
    });

  const clear = () => {
    setResult(null);
    setCode('');
    promo?.setApplied(null);
  };

  return (
    <div className="mt-4 border-t border-ink/10 pt-4">
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink/50">
        <IconTag size={12} /> {t('label')}
      </span>

      {result?.valid ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-teal/30 bg-teal/[0.06] px-3 py-2">
          <span className="flex items-center gap-1.5 font-mono text-xs text-teal">
            <IconCheck size={14} /> {result.code} · −{formatUsd((result.discountCents ?? 0) / 100)}
          </span>
          <button type="button" onClick={clear} className="text-ink/45 hover:text-ink" aria-label={t('remove')}>
            <IconX size={15} />
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); apply(); }}
          className="flex items-center gap-2"
        >
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/\s/g, '')); if (result) setResult(null); }}
            placeholder={t('placeholder')}
            aria-label={t('label')}
            className="flex-1 rounded-lg border border-ink/15 bg-paper-light px-3 py-2 font-mono text-sm uppercase tracking-wide text-ink outline-none focus-visible:ring-2 focus-visible:ring-ochre"
          />
          <button
            type="submit"
            disabled={pending || !code.trim()}
            className="rounded-lg border border-ink/20 bg-paper-light px-3 py-2 font-mono text-xs uppercase tracking-wide text-ink/80 hover:border-ink/40 disabled:opacity-50"
          >
            {pending ? <IconLoader2 size={14} className="animate-spin" /> : t('apply')}
          </button>
        </form>
      )}

      {result && !result.valid && (
        <p className="mt-1.5 font-mono text-[11px] text-stampred">{t(`error.${result.reason}`)}</p>
      )}

      {result?.valid && (
        <p className="mt-2 text-right font-mono text-sm text-ink tabular-nums">
          {t('newTotal')}{' '}
          <span className="font-semibold">{formatUsd((result.netCents ?? grossCents) / 100)}</span>
        </p>
      )}
    </div>
  );
}
