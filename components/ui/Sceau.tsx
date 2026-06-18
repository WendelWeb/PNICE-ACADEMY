import { cn } from '@/lib/cn';

type SceauProps = {
  children: React.ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  rotate?: number;
  tone?: 'ochre' | 'red' | 'ink';
  print?: boolean;
  className?: string;
  title?: string;
};

const sizes: Record<NonNullable<SceauProps['size']>, string> = {
  xs: 'h-12 w-12 text-[8px]',
  sm: 'h-20 w-20 text-[10px]',
  md: 'h-28 w-28 text-[11px]',
  lg: 'h-36 w-36 text-[13px]',
};

const tones: Record<NonNullable<SceauProps['tone']>, string> = {
  ochre: 'border-ochre text-ochre',
  red: 'border-stampred text-stampred',
  ink: 'border-ink text-ink',
};

/**
 * The signature element of PNICE Academy: an elegant circular seal.
 * The only deliberately bold element on the site — everything else stays
 * disciplined around it.
 */
export function Sceau({
  children,
  size = 'md',
  rotate = -6,
  tone = 'ochre',
  print = false,
  className,
  title,
}: SceauProps) {
  return (
    <span
      title={title}
      style={
        {
          '--sceau-rot': `${rotate}deg`,
          ...(print ? {} : { transform: `rotate(${rotate}deg)` }),
        } as React.CSSProperties
      }
      className={cn(
        'relative inline-flex select-none items-center justify-center rounded-full border-[1.5px] font-display font-bold uppercase leading-[0.95] tracking-[0.04em]',
        'after:pointer-events-none after:absolute after:inset-[5px] after:rounded-full after:border after:border-current after:opacity-40',
        sizes[size],
        tones[tone],
        print && 'animate-stampIn',
        className,
      )}
    >
      <span className="flex flex-col items-center justify-center px-1 text-center">
        {children}
      </span>
    </span>
  );
}
