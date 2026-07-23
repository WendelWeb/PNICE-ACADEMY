'use client';

import { useState, useTransition } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { Link, useRouter } from '@/i18n/routing';
import { buttonClasses } from '@/components/ui/Button';
import { markLessonDoneAction } from '@/lib/learner/progress-actions';

/**
 * Client wiring for the "Make fini" button (Task L1d). Optimistic: flips to
 * the done state immediately on success, then `router.refresh()`s so the
 * server-rendered lesson rail / dashboard progress catch up. On the action
 * detecting the whole course just got completed, surfaces the certificate
 * toast + a link to the public verification page.
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(initialDone);
  const [certCode, setCertCode] = useState<string | null>(null);

  function onClick() {
    startTransition(async () => {
      const result = await markLessonDoneAction(courseSlug, lessonIndex);
      if (result.ok) {
        setDone(true);
        if (result.certificateIssued && result.verificationCode) {
          setCertCode(result.verificationCode);
        }
        router.refresh();
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
      {certCode ? (
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
