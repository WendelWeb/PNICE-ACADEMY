import { cn } from '@/lib/cn';

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-page px-6 md:px-8', className)}>
      {children}
    </div>
  );
}

export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn('py-16 md:py-24', className)}>
      {children}
    </section>
  );
}

/** Small uppercase mono label used to introduce sections. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-mono text-xs uppercase tracking-[0.18em] text-teal',
        className,
      )}
    >
      {children}
    </span>
  );
}
