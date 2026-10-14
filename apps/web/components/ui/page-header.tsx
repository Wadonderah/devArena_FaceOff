'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/// The top of a page: title, what it is for, and the actions available.
export function PageHeader({
  title,
  badge,
  subtitle,
  actions,
  rule = true,
  className,
}: {
  title: ReactNode;
  /// Beside the title but outside the `h1` — a status chip is not part of the
  /// page's name.
  badge?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /// Off when the first element below is already a panel with its own edge.
  rule?: boolean;
  className?: string;
}) {
  return (
    <header className={cn('mb-5 sm:mb-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl leading-tight">{title}</h1>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-dim sm:text-[14px]">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>
        )}
      </div>

      {rule && (
        <span
          aria-hidden
          className="mt-4 block h-px w-full bg-gradient-to-r from-line via-line to-transparent sm:mt-5"
        />
      )}
    </header>
  );
}
