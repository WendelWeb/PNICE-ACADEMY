'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconLoader2,
  IconSend,
} from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import { buttonClasses } from '@/components/ui/Button';
import { Sceau } from '@/components/ui/Sceau';
import { Stamp } from '@/components/ui/Stamp';
import { applyAsTeacherAction } from '@/lib/teacher/actions';
import {
  BIO_MIN_LENGTH,
  PAYOUT_METHODS,
  validateApplyInput,
  type ApplyAsTeacherInput,
  type PayoutMethod,
} from '@/lib/teacher/apply-validation';

const inputCls =
  'w-full rounded-lg border border-ink/15 bg-paper-light px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink/35 focus-visible:border-ochre focus-visible:ring-2 focus-visible:ring-ochre/25';
const labelCls = 'mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-ink/55';
const errorCls = 'mt-1.5 flex items-center gap-1.5 text-xs text-stampred';

export type ApplyWizardInitial = {
  displayName?: string | null;
  bioHt?: string | null;
  bioFr?: string | null;
  photoUrl?: string | null;
  payoutMethod?: PayoutMethod | null;
  payoutDestination?: string | null;
};

type StepNum = 1 | 2 | 3;
const STEP_KEYS = ['profile', 'payout', 'terms'] as const;
type FieldErrors = Partial<
  Record<'displayName' | 'bioHt' | 'bioFr' | 'payoutDestination' | 'terms', string>
>;

/**
 * The « Devenir enseignant » multi-step application form (Task C3-T2).
 * Three stations on a route-line stepper (Pwofil → Peman → Kondisyon), each
 * client-validated before advancing (mirrors `validateApplyInput` so the
 * server never sees a submission the UI wouldn't have already caught) —
 * final submit calls `applyAsTeacherAction` and, on success, replaces the
 * form with a stamped « Kandidati resevwa » confirmation (the same `Stamp`
 * gesture as the merci page / certificate verification, per the motion
 * system's "one gesture, reused meaningfully" rule).
 *
 * `initial` prefills the form when a REJECTED applicant re-applies (their
 * previous answers are worth keeping — only `termsAccepted` always resets).
 */
export function ApplyWizard({ initial }: { initial?: ApplyWizardInitial }) {
  const t = useTranslations('teach.apply');
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<StepNum>(1);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [bioHt, setBioHt] = useState(initial?.bioHt ?? '');
  const [bioFr, setBioFr] = useState(initial?.bioFr ?? '');
  const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl ?? '');
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>(
    initial?.payoutMethod ?? 'moncash',
  );
  const [payoutDestination, setPayoutDestination] = useState(initial?.payoutDestination ?? '');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  function focusPanel() {
    // Move focus + scroll to the wizard's top on every step change — keeps
    // keyboard/screen-reader users oriented as the form content swaps out.
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function validateStep1(): FieldErrors {
    const e: FieldErrors = {};
    if (!displayName.trim()) e.displayName = t('profile.errorDisplayName');
    if (bioHt.trim().length < BIO_MIN_LENGTH) e.bioHt = t('profile.errorBioHt', { min: BIO_MIN_LENGTH });
    if (bioFr.trim().length < BIO_MIN_LENGTH) e.bioFr = t('profile.errorBioFr', { min: BIO_MIN_LENGTH });
    return e;
  }

  function validateStep2(): FieldErrors {
    const e: FieldErrors = {};
    if (!payoutDestination.trim()) e.payoutDestination = t('payout.errorDestination');
    return e;
  }

  function goNext() {
    const stepErrors = step === 1 ? validateStep1() : step === 2 ? validateStep2() : {};
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setStep((s) => (s < 3 ? ((s + 1) as StepNum) : s));
    focusPanel();
  }

  function goBack() {
    setErrors({});
    setStep((s) => (s > 1 ? ((s - 1) as StepNum) : s));
    focusPanel();
  }

  function submit() {
    if (!termsAccepted) {
      setErrors({ terms: t('terms.errorTerms') });
      return;
    }
    setErrors({});
    setServerError(null);

    const input: ApplyAsTeacherInput = {
      displayName: displayName.trim(),
      bioHt: bioHt.trim(),
      bioFr: bioFr.trim(),
      photoUrl: photoUrl.trim() || null,
      payoutMethod,
      payoutDestination: payoutDestination.trim(),
      termsAccepted,
    };
    // Defense in depth: re-run the exact same validator the server uses
    // before even sending the request.
    const invalid = validateApplyInput(input);
    if (invalid) {
      setServerError(t('errorGeneric'));
      return;
    }

    start(async () => {
      const result = await applyAsTeacherAction(input);
      if (result.ok) {
        setDone(true);
        router.refresh();
        return;
      }
      if (result.message === 'db_required') setServerError(t('errorDbRequired'));
      else if (result.message === 'already_active') setServerError(t('errorAlreadyActive'));
      else setServerError(t('errorGeneric'));
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-teal/30 bg-teal/[0.06] p-7 text-center sm:p-10">
        <Stamp immediate rotate={-8}>
          <Sceau size="md" tone="ink" rotate={-8}>
            <span className="text-[9px] tracking-[0.2em]">{t('sealLabel')}</span>
            <IconCheck size={26} className="my-0.5" />
          </Sceau>
        </Stamp>
        <h2 className="mt-5 font-display text-2xl font-bold leading-tight text-ink">
          {t('successTitle')}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-graphite/80">
          {t('successBody')}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="rounded-2xl border border-ink/12 bg-paper-light p-6 sm:p-8"
    >
      <WizardStepper step={step} labels={STEP_KEYS.map((k) => t(`steps.${k}`))} />
      <p className="mb-6 mt-1 font-mono text-[11px] uppercase tracking-wide text-ink/45">
        {t('stepOf', { step, total: 3 })}
      </p>

      {step === 1 && (
        <div className="space-y-5">
          <h2 className="font-display text-xl font-bold text-ink">{t('profile.title')}</h2>

          <div>
            <label htmlFor="apply-displayName" className={labelCls}>
              {t('profile.displayName')}
            </label>
            <input
              id="apply-displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('profile.displayNamePlaceholder')}
              maxLength={80}
              autoComplete="name"
              className={inputCls}
            />
            {errors.displayName && <FieldError message={errors.displayName} />}
          </div>

          <div>
            <label htmlFor="apply-bioHt" className={labelCls}>
              {t('profile.bioHt')}
            </label>
            <textarea
              id="apply-bioHt"
              value={bioHt}
              onChange={(e) => setBioHt(e.target.value)}
              placeholder={t('profile.bioHtPlaceholder')}
              className={cn(inputCls, 'min-h-[110px] resize-y')}
            />
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs leading-relaxed text-graphite/60">
                {t('profile.bioHelp', { min: BIO_MIN_LENGTH })}
              </p>
              <span className="shrink-0 pl-2 font-mono text-[11px] tabular-nums text-ink/40">
                {bioHt.trim().length}/{BIO_MIN_LENGTH}
              </span>
            </div>
            {errors.bioHt && <FieldError message={errors.bioHt} />}
          </div>

          <div>
            <label htmlFor="apply-bioFr" className={labelCls}>
              {t('profile.bioFr')}
            </label>
            <textarea
              id="apply-bioFr"
              value={bioFr}
              onChange={(e) => setBioFr(e.target.value)}
              placeholder={t('profile.bioFrPlaceholder')}
              className={cn(inputCls, 'min-h-[110px] resize-y')}
            />
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs leading-relaxed text-graphite/60">
                {t('profile.bioHelp', { min: BIO_MIN_LENGTH })}
              </p>
              <span className="shrink-0 pl-2 font-mono text-[11px] tabular-nums text-ink/40">
                {bioFr.trim().length}/{BIO_MIN_LENGTH}
              </span>
            </div>
            {errors.bioFr && <FieldError message={errors.bioFr} />}
          </div>

          <div>
            <label htmlFor="apply-photoUrl" className={labelCls}>
              {t('profile.photoUrl')}
            </label>
            <input
              id="apply-photoUrl"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder={t('profile.photoUrlPlaceholder')}
              inputMode="url"
              className={inputCls}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <h2 className="font-display text-xl font-bold text-ink">{t('payout.title')}</h2>

          <div>
            <label htmlFor="apply-payoutMethod" className={labelCls}>
              {t('payout.method')}
            </label>
            <select
              id="apply-payoutMethod"
              value={payoutMethod}
              onChange={(e) => setPayoutMethod(e.target.value as PayoutMethod)}
              className={cn(inputCls, 'cursor-pointer')}
            >
              {PAYOUT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`payout.methods.${m}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="apply-payoutDestination" className={labelCls}>
              {t('payout.destination')}
            </label>
            <input
              id="apply-payoutDestination"
              value={payoutDestination}
              onChange={(e) => setPayoutDestination(e.target.value)}
              placeholder={t(`payout.hints.${payoutMethod}`)}
              className={inputCls}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-graphite/60">
              {t(`payout.hints.${payoutMethod}`)}
            </p>
            {errors.payoutDestination && <FieldError message={errors.payoutDestination} />}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <h2 className="font-display text-xl font-bold text-ink">{t('terms.title')}</h2>

          <ul className="space-y-2.5 rounded-lg border border-ink/10 bg-paper p-4">
            {t.raw('terms.summary').map((line: string, i: number) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-graphite">
                <IconCheck size={16} className="mt-0.5 shrink-0 text-teal" />
                {line}
              </li>
            ))}
          </ul>

          <label className="flex items-start gap-2.5 rounded-lg border border-ink/10 bg-paper px-3.5 py-3 text-sm text-graphite">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => {
                setTermsAccepted(e.target.checked);
                if (e.target.checked) setErrors((prev) => ({ ...prev, terms: undefined }));
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-ochre"
            />
            <span>{t('terms.checkbox')}</span>
          </label>
          {errors.terms && <FieldError message={errors.terms} />}
        </div>
      )}

      {serverError && (
        <p className="mt-5 flex items-center gap-1.5 font-mono text-xs text-stampred">
          <IconAlertTriangle size={14} className="shrink-0" />
          {serverError}
        </p>
      )}

      <div className="mt-7 flex items-center justify-between gap-3 border-t border-ink/10 pt-6">
        {step > 1 ? (
          <button
            type="button"
            onClick={goBack}
            disabled={pending}
            className={buttonClasses('ghost', 'md')}
          >
            <IconArrowLeft size={15} />
            {t('back')}
          </button>
        ) : (
          <span />
        )}

        {step < 3 ? (
          <button type="button" onClick={goNext} className={buttonClasses('primary', 'md')}>
            {t('next')}
            <IconArrowRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={pending || !termsAccepted}
            className={buttonClasses('primary', 'md')}
          >
            {pending ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={15} />}
            {pending ? t('submitting') : t('submit')}
          </button>
        )}
      </div>
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className={errorCls}>
      <IconAlertTriangle size={13} className="shrink-0" />
      {message}
    </p>
  );
}

/**
 * The 3-station progress indicator — a horizontal companion to
 * `components/dashboard/CourseProgressRoute.tsx`'s route-line grammar
 * (same `.route-thread-h`/`.route-fill` CSS, same station-dot language),
 * so the wizard's "how far along am I" visual reads as the same document
 * metaphor as the rest of the site rather than a generic form stepper.
 */
function WizardStepper({ step, labels }: { step: StepNum; labels: string[] }) {
  const total = labels.length;
  const pct = total > 1 ? ((step - 1) / (total - 1)) * 100 : 0;

  return (
    <div>
      <div aria-hidden="true" className="relative h-7">
        <div className="route-thread-h absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full" />
        <div
          className="route-fill absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-teal"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-between">
          {labels.map((_, i) => {
            const n = i + 1;
            const state = n < step ? 'done' : n === step ? 'current' : 'upcoming';
            return (
              <span
                key={n}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-paper-light font-mono text-[11px] font-semibold',
                  state === 'done' && 'border-teal bg-teal text-paper-light',
                  state === 'current' && 'border-ochre text-ochre',
                  state === 'upcoming' && 'border-ink/20 text-ink/30',
                )}
              >
                {state === 'done' ? <IconCheck size={13} /> : n}
              </span>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between">
        {labels.map((label, i) => (
          <span
            key={label}
            className={cn(
              'font-mono text-[10px] uppercase tracking-wide',
              i + 1 === step ? 'text-ink' : 'text-ink/40',
              i === 0 && 'text-left',
              i === labels.length - 1 && 'text-right',
            )}
            style={{ flex: '1 1 0%' }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
