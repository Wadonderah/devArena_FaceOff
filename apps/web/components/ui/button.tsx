'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /// Rendered after the label — a direction or outcome, never decoration.
  /// Hidden while loading so the spinner is the only moving thing.
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-white glow-brand hover:bg-brand-bright active:translate-y-px',
  secondary:
    'bg-surface-3 text-ink border border-line hover:border-line-bright hover:bg-surface-3/80',
  ghost: 'text-ink-dim hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
};

// Pills throughout — every reference uses them, and they read softer against
// the rounder cards without changing a single colour.
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5',
  md: 'h-10 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // aria-busy rather than swapping the label, so a screen reader announces
      // the pending state without the accessible name changing underneath it.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium select-none',
        'transition-[background-color,border-color,transform,opacity] duration-150',
        'disabled:opacity-45 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="size-3.5 rounded-full border-2 border-current border-r-transparent animate-spin"
        />
      )}
      {children}
      {icon && !loading && (
        <span aria-hidden className="shrink-0 [&>svg]:size-4">
          {icon}
        </span>
      )}
    </button>
  );
});
