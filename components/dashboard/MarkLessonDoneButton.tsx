'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { IconCheck, IconDownload, IconRefresh } from '@tabler/icons-react';
import { Link, useRouter } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { Sceau } from '@/components/ui/Sceau';
import { RatingWidget } from '@/components/reviews/RatingWidget';
import { markLessonDoneAction } from '@/lib/learner/progress-actions';

/**
 * Client wiring for the "Make fini" button (Task L1d, reworked by Stage:
 * learner account). Optimistic: flips to the done state on success, then
 * `router.refresh()`s so the server-rendered lesson rail / dashboard
 * progress catch up.
 *
 * Loop closers this stage adds:
 *  - ERROR BRANCH: a failed action no longer disappears silently — red text
 *    + the button stays enabled as a retry.
 *  - CELEBRATION: finishing the LAST lesson renders a real celebration card
 *    (stamped seal, certificate code + links, invitation to rate the course
 *    with the existing RatingWidget) instead of a one-line toast. The toast
 *    path remains for re-marking a lesson when the certificate already
 *    existed.
 */
export function MarkLessonDoneButton({
  courseSlug,
  lessonIndex,
  initialDone,
  markLabel,
  doneLabel,
  certIssuedToast,
  viewCertificateLabel,
}: {
  courseSlug: string;
  lessonIndex: number;
  initialDone: boolean;
  markLabel: string;
  doneLabel: string;
  certIssuedToast: string;
  viewCertificateLabel: string;
}) {
  const t = useTranslations('lesson');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(initialDone);
  const [certCode, setCertCode] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [failed, setFailed] = useState(false);

  function onClick() {
    startTransition(async () => {
      setFailed(false);
      const result = await markLessonDoneAction(courseSlug, lessonIndex);
      if (result.ok) {
        setDone(true);
        if (result.verificationCode) {
          setCertCode(result.verificationCode);
          if (result.certificateIssued) setCelebrate(true);
        }
        router.refresh();
      } else {
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending || done}
        className={buttonClasses(done ? 'ghost' : 'dark', 'md')}
      >
        <IconCheck size={16} />
        {done ? doneLabel : markLabel}
      </button>

      {failed ? (
        <p className="flex items-center gap-1.5 font-mono text-xs text-stampred" role="alert">
          {t('markError')}
          <button
            type="button"
            onClick={onClick}
            disabled={isPending}
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
          >
            <IconRefresh size={12} />
            {t('retry')}
          </button>
        </p>
      ) : null}

      {celebrate && certCode ? (
        <div className="mt-3 max-w-xl rounded-2xl border-2 border-teal/30 bg-paper-light p-6 text-center motion-reduce:animate-none sm:p-8">
          <span aria-hidden="true" className="block">
            <Sceau size="sm" tone="ochre" rotate={-8} print className="mx-auto">
              <span className="flex flex-col items-center leading-tight">
                <IconCheck size={22} stroke={2.4} />
                <span className="mt-0.5 font-display text-[9px] font-black uppercase">PNICE</span>
              </span>
            </Sceau>
          </span>
          <h2 className="mt-4 font-display text-2xl font-black leading-tight text-ink">
            {t('celebrationTitle')}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-graphite/75">
            {t('celebrationBody')}
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.16em] text-ink/50">
            {t('celebrationCodeLabel')}
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-wider text-ink">{certCode}</p>
          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`/certificats/verifier/${certCode}`}
              className={buttonClasses('primary', 'md')}
            >
              {viewCertificateLabel}
            </Link>
            <a
              href={`/api/certificate/${encodeURIComponent(certCode)}?locale=${locale === 'fr' ? 'fr' : 'ht'}`}
              className={buttonClasses('ghost', 'md')}
            >
              <IconDownload size={16} />
              {t('celebrationDownload')}
            </a>
          </div>
          <div className="mt-7 border-t border-ink/10 pt-5 text-left">
            <p className="mb-3 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-ink/55">
              {t('celebrationRateInvite')}
            </p>
            <div className="flex justify-center">
              <RatingWidget courseSlug={courseSlug} />
            </div>
          </div>
        </div>
      ) : certCode ? (
        <p className="max-w-xs font-mono text-xs leading-relaxed text-teal">
          {certIssuedToast}{' '}
          <Link
            href={`/certificats/verifier/${certCode}`}
            className="underline underline-offset-2 hover:text-ochre"
          >
            {viewCertificateLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
