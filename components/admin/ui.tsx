import { cn } from '@/lib/cn';
import type { AdminRole } from '@/lib/admin/roles';
import { roleTone } from '@/lib/admin/roles';

/**
 * Admin presentation primitives. Internal-tool language: dense, mono numerals,
 * no decorative animation. Tone is FUNCTIONAL only — ochre = highlighted,
 * teal = healthy/operational, stampred = risk/alert (never decorative).
 */

export type KpiTone = 'default' | 'ochre' | 'teal' | 'alert';

const valueToneClass: Record<KpiTone, string> = {
  default: 'text-ink',
  ochre: 'text-ochre',
  teal: 'text-teal',
  alert: 'text-stampred',
};

/** A titled group of KPI cards. */
export function KpiGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/50">
        {title}
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

/** Single-metric card. Value rendered in IBM Plex Mono. */
export function KpiCard({
  label,
  value,
  secondary,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  /** e.g. gourdes equivalent under a USD value. */
  secondary?: string;
  /** small caption under the value. */
  hint?: string;
  tone?: KpiTone;
}) {
  return (
    <div className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink/55">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 font-mono text-[26px] font-semibold leading-none tabular-nums',
          valueToneClass[tone],
        )}
      >
        {value}
      </p>
      {secondary && (
        <p className="mt-1.5 font-mono text-xs text-graphite/55 tabular-nums">
          {secondary}
        </p>
      )}
      {hint && <p className="mt-1.5 text-xs leading-snug text-graphite/60">{hint}</p>}
    </div>
  );
}

/** Card showing several sub-metrics (e.g. today / 7d / 30d). */
export function KpiSplitCard({
  label,
  rows,
  tone = 'default',
  hint,
}: {
  label: string;
  rows: { label: string; value: string }[];
  tone?: KpiTone;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-ink/12 bg-paper-light p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink/55">
        {label}
      </p>
      <dl className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="font-mono text-[11px] uppercase tracking-wide text-graphite/55">
              {r.label}
            </dt>
            <dd
              className={cn(
                'font-mono text-lg font-semibold leading-none tabular-nums',
                valueToneClass[tone],
              )}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      {hint && <p className="mt-3 text-xs leading-snug text-graphite/60">{hint}</p>}
    </div>
  );
}

/** Colored role chip. */
export function RoleBadge({ role, label }: { role: AdminRole; label: string }) {
  const tone = roleTone(role);
  const cls =
    tone === 'ochre'
      ? 'bg-ochre/15 text-ochre'
      : tone === 'teal'
        ? 'bg-teal/15 text-teal'
        : 'bg-ink/10 text-ink/70';
  return (
    <span
      className={cn(
        'rounded px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
        cls,
      )}
    >
      {label}
    </span>
  );
}

/** Small mono note for a "mock data" disclaimer line. */
export function MockNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 font-mono text-[11px] leading-relaxed text-graphite/55">
      <span aria-hidden className="text-ochre">
        ●
      </span>
      {children}
    </p>
  );
}
