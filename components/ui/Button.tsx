import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'dark' | 'ghost';
export type ButtonSize = 'md' | 'lg';

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded font-body font-semibold transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed',
    size === 'lg' ? 'px-7 py-3.5 text-[15px]' : 'px-5 py-2.5 text-sm',
    variant === 'primary' &&
      'bg-ochre text-[#1b1207] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ochre/30',
    variant === 'dark' &&
      'bg-ink text-paper-light hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/25',
    variant === 'ghost' &&
      'border border-ink/30 text-ink hover:border-ink/60 hover:bg-ink/[0.03]',
    className,
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={buttonClasses(variant, size, className)} {...props} />
  );
}
