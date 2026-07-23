'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ClerkLoading, ClerkLoaded, SignedIn, SignedOut } from '@clerk/nextjs';
import { IconCircleCheck, IconLoader2 } from '@tabler/icons-react';
import { clerkEnabled } from '@/lib/clerk';
import { buttonClasses } from '@/components/ui/Button';
import { AuthCta } from '@/components/auth/AuthCta';
import { registerTeachInterestAction } from '@/lib/site-actions-public';
import { cn } from '@/lib/cn';

/**
 * The « Mwen enterese » teach-interest capture (U3 TeachTeaser, reused by
 * U4bis /enseigner). Signed-in learners fire `registerTeachInterestAction`
 * straight from here; signed-out visitors get the same account-gate pattern
 * as `AuthCta` elsewhere on the site (opens the sign-up modal, then lands on
 * /enseigner). Never double-submits: the button is replaced by the success
 * state once the ticket is filed.
 */
export function TeachInterestCta({ className }: { className?: string }) {
  const t = useTranslations('home.teachTeaser');
  const [pending, start] = useTransition();
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle');

  const btnClass = cn(buttonClasses('ghost', 'lg'), className);

  const gated = (
    <AuthCta href="/enseigner" className={btnClass}>
      {t('interestCta')}
    </AuthCta>
  );

  if (!clerkEnabled) return gated;

  if (state === 'done') {
    return (
      <p className="inline-flex items-center gap-2 font-mono text-sm text-teal">
        <IconCircleCheck size={18} className="shrink-0" />
        {t('interestSuccess')}
      </p>
    );
  }

  return (
    <>
      <ClerkLoading>{gated}</ClerkLoading>
      <ClerkLoaded>
        <SignedOut>{gated}</SignedOut>
        <SignedIn>
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setState('idle');
                  const r = await registerTeachInterestAction();
                  setState(r.ok ? 'done' : 'error');
                })
              }
              className={btnClass}
            >
              {pending && <IconLoader2 size={16} className="animate-spin" />}
              {t('interestCta')}
            </button>
            {state === 'error' && (
              <p className="mt-2 font-mono text-xs text-stampred">{t('interestError')}</p>
            )}
          </div>
        </SignedIn>
      </ClerkLoaded>
    </>
  );
}
