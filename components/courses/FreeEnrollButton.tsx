'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { IconLoader2, IconSchool } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

/**
 * The FREE course's call-to-action — replaces the buy button and the cart
 * button on an explicitly-free course (lib/courses/pricing-rules.ts): one
 * tap enrols the signed-in visitor and lands them in their dashboard;
 * signed-out visitors round-trip through sign-in and come straight back.
 * The server (/api/enroll/free) re-checks the REAL price — this button
 * carries no authority, only intent.
 */
export function FreeEnrollButton({ courseSlug, className }: { courseSlug: string; className?: string }) {
  const t = useTranslations('course');
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function enroll() {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/enroll/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseSlug }),
      });
      if (res.ok) {
        window.location.assign(`/${locale}/tableau-de-bord`);
        return; // keep the spinner while the browser navigates
      }
      if (res.status === 401) {
        const back = `/${locale}/formations/${courseSlug}`;
        window.location.assign(`/${locale}/sign-in?redirect_url=${encodeURIComponent(back)}`);
        return;
      }
      setErrorMsg(t('freeErr'));
      setBusy(false);
    } catch {
      setErrorMsg(t('freeErr'));
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={enroll}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-teal px-4 py-3 font-display text-[15px] font-bold text-paper-light transition-transform hover:-translate-y-px disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
      >
        {busy ? <IconLoader2 size={18} className="animate-spin" /> : <IconSchool size={18} />}
        {t('freeCta')}
      </button>
      {errorMsg && (
        <p className="mt-2 text-center font-mono text-[11px] text-stampred" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
