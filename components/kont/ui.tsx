import { IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

// Temporary custom-field schema stored in Clerk unsafeMetadata until a Neon
// `profiles` table exists. Keep in sync across the app — do not add fields here
// without planning the migration.
export type PniceUnsafeMetadata = {
  certificateName?: string;
  country?: string;
  city?: string;
  bio?: string;
  pronounsTitle?: string;
  localePref?: 'ht' | 'fr';
  // Display/playback preferences (see lib/usePreferences.ts for the shape).
  prefs?: Record<string, unknown>;
};

export type FormStatusValue = { type: 'success' | 'error'; message: string } | null;

export const inputClass =
  'w-full rounded-lg border border-ink/15 bg-paper-light px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink/30 focus-visible:border-ochre';

export function SettingsCard({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-ink/12 bg-paper-light p-5 sm:p-6',
        className,
      )}
    >
      {title && (
        <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      )}
      <div className={cn(title && 'mt-4')}>{children}</div>
    </section>
  );
}

export function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id?: string;
  label?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-ink/55"
        >
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p className="mt-1.5 text-xs leading-relaxed text-graphite/60">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-stampred">
          <IconAlertTriangle size={13} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function TextAreaInput(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={cn(inputClass, 'min-h-[92px] resize-y', props.className)}
    />
  );
}

export function SelectInput(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return (
    <select {...props} className={cn(inputClass, 'cursor-pointer', props.className)} />
  );
}

export function FormStatus({ status }: { status: FormStatusValue }) {
  if (!status) return null;
  return (
    <p
      className={cn(
        'mt-3 flex items-center gap-1.5 text-sm',
        status.type === 'success' ? 'text-teal' : 'text-stampred',
      )}
      role="status"
    >
      {status.type === 'success' ? (
        <IconCheck size={16} className="shrink-0" />
      ) : (
        <IconAlertTriangle size={16} className="shrink-0" />
      )}
      {status.message}
    </p>
  );
}

/** Extract the first Clerk API error code + message from a thrown error. */
export function clerkError(err: unknown): { code?: string; message?: string } {
  const e = err as {
    errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
  };
  const first = e?.errors?.[0];
  return { code: first?.code, message: first?.longMessage || first?.message };
}
