import { useTranslations } from 'next-intl';
import { Price, PriceSecondary } from '@/components/ui/Price';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { FreeEnrollButton } from '@/components/courses/FreeEnrollButton';

/**
 * The mobile counterpart of the sticky desktop buy-card: a fixed, compact
 * bottom bar (price + primary CTA only) so the purchase action stays one tap
 * away while reading the sales page. Hidden at `lg` where the sticky right
 * rail takes over. The page reserves matching bottom padding so this never
 * causes layout shift on mount.
 */
export function MobileBuyBar({
  courseSlug,
  courseTitle,
  priceUsd,
  ctaLabel,
}: {
  courseSlug: string;
  /** For the cart snapshot the compact add-to-cart button takes. */
  courseTitle: string;
  priceUsd: number;
  ctaLabel: string;
}) {
  const t = useTranslations('course');

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/12 bg-paper-light/95 px-4 py-3 shadow-[0_-10px_28px_-18px_rgba(16,32,74,0.35)] backdrop-blur-sm lg:hidden">
      <div className="mx-auto flex max-w-page items-center justify-between gap-4">
        <div className="min-w-0">
          <Price
            usd={priceUsd}
            className="block font-display text-xl font-black leading-none text-ink"
          />
          <div className="flex items-center gap-1">
            <PriceSecondary
              usd={priceUsd}
              className="block font-mono text-[11px] text-graphite/55"
            />
            <span className="font-mono text-[10px] text-ink/60">
              {t('lifetime')}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {priceUsd === 0 ? (
            /* Explicitly-free course: nothing to pay, nothing to stack in a
               basket — one enrol button. */
            <FreeEnrollButton courseSlug={courseSlug} />
          ) : (
            <>
              {/* One tap into the basket without leaving the page — the bar is
                  where mobile buyers already look, and mobile IS the audience. */}
              <AddToCartButton slug={courseSlug} title={courseTitle} priceUsd={priceUsd} compact />
              <AuthCta
                href={`/checkout?course=${courseSlug}`}
                className={buttonClasses('primary', 'md')}
              >
                {ctaLabel}
              </AuthCta>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
