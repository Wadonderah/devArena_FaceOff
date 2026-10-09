'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/// The top of a page: what it is, what it is for, and what you can do here.
///
/// Every page had hand-rolled this — an `h1` at `text-3xl`, a `text-[15px]`
/// subtitle, and a row of buttons, with the gap and the wrap behaviour slightly
/// different each time. Four files had four different bottom margins, so the
/// distance from the title to the first panel changed as you moved between
/// them, which is the kind of inconsistency nobody can name but everybody
/// feels.
///
/// The fading rule is the same device as `Section` and the competition panel,
/// so a page, a group and a panel all announce themselves the same way.
export function PageHeader({
  title,
  badge,
  subtitle,
  actions,
  rule = true,
  className,
}: {
  title: ReactNode;
  /// Rendered beside the title, deliberately outside the `h1`. A status chip is
  /// not part of the page's name, and a screen reader reading "Leaderboard
  /// registration open" as one heading is not what anyone meant.
  badge?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /// Off for a page whose first element is already a panel with its own top
  /// edge — two rules 16px apart read as a mistake.
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

        {/* Full width on a phone so the buttons get a line of their own
            instead of being squeezed beside a wrapping title, and so they wrap
            among themselves predictably rather than one-per-row. */}
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
