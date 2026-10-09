'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/// A group heading, shared by every page that lists things.
export function Section({
  icon: Icon,
  title,
  blurb,
  count,
  tone = 'neutral',
  actions,
  className,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  blurb?: string;
  /// Hidden when 1 or less — a count of one is noise.
  count?: number;
  tone?: 'neutral' | 'live';
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    // Not responsive on purpose: padding inside elements shrinks on a phone,
    // but the gap *between* groups is what keeps a narrow column readable.
    <section className={cn('mt-10', className)}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <Icon
            aria-hidden
            size={14}
            strokeWidth={1.5}
            className={tone === 'live' ? 'shrink-0 text-live' : 'shrink-0 text-ink-faint'}
          />
        )}

        <h2 className="text-[14px] font-medium leading-none tracking-tight text-ink-dim">
          {title}
        </h2>

        {count !== undefined && count > 1 && (
          <span className="rounded-full border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums text-ink-faint">
            {count}
          </span>
        )}

        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />

        {actions}
      </div>

      {blurb && (
        <p className={cn('mt-1.5 text-[12.5px] leading-relaxed text-ink-faint', Icon && 'pl-[24px]')}>
          {blurb}
        </p>
      )}

      <div className="mt-3.5 sm:mt-4">{children}</div>
    </section>
  );
}
