'use client';

import { useTranslations } from 'next-intl';
import { AuthCta } from '@/components/auth/AuthCta';
import { buttonClasses, type ButtonVariant } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/**
 * The « Devenir enseignant » CTA (/enseigner's signed-out entry; the home
 * recruit panel now links /enseigner directly) — Task C3-T2 REPLACES the
 * old interest-capture ticket (`registerTeachInterestAction`) for signed-in
 * users now that applications are actually open: a signed-in user just
 * navigates straight to /enseigner, where the real wizard (or their
 * application status) lives. Signed-out visitors keep the exact same
 * auth-gate pattern as every other conversion CTA on the site (`AuthCta`):
 * sign up in a modal, then land on /enseigner already authenticated.
 */
export function TeachInterestCta({
  className,
  variant = 'ghost',
}: {
  className?: string;
  /** `ghost` on the home teaser (default); `primary` where it is THE action (/enseigner). */
  variant?: ButtonVariant;
}) {
  const t = useTranslations('home.teach');

  return (
    <AuthCta href="/enseigner" className={cn(buttonClasses(variant, 'lg'), className)}>
      {t('interestCta')}
    </AuthCta>
  );
}
