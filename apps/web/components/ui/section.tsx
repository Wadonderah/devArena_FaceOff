'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/// A group heading, shared by every page that lists things.
///
/// Extracted from the dashboard, where it was rewritten because the original
/// read as sloppy. The reasons are worth keeping, because each one is a pattern
/// that was repeated across the app:
///
///   - The count was appended into the label as `· 3`, inside an uppercase
///     mono string. A separator glyph doing the work of a container is the
///     cheapest possible way to show a number, and it looked it.
///   - The title and its explanation were both `text-ink-faint` and stacked
///     with 4px between them, so two unrelated lines read as one paragraph
///     with no hierarchy at all.
///   - The title was uppercase mono at 11px — the same treatment as the
///     console's instrument readouts, which is a template signature rather
///     than a hierarchy. (The team card was rewritten once for exactly this.)
///
/// Now: the title is sentence case and a step brighter than its explanation,
/// the count has its own container, a rule carries the eye to the edge and
/// separates one group from the next, and the explanation hangs indented under
/// the title rather than under the icon.
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
  /// Optional. A group whose title is self-explanatory does not need a line of
  /// prose underneath it just because the component allows one.
  blurb?: string;
  /// Shown only when it adds something. "Open for registration 1" beside a
  /// single card is a number for its own sake.
  count?: number;
  tone?: 'neutral' | 'live';
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('mt-8 sm:mt-10', className)}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <Icon
            aria-hidden
            size={14}
            strokeWidth={1.5}
            // The one group that is genuinely about "now" takes the live colour
            // on its marker. Everything else stays neutral, so the colour keeps
            // meaning something.
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

        {/* Fades out rather than crossing the full width: it marks where a
            group starts without drawing a hard divider across the page, and it
            is the same language as the rule on the competition panel. */}
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />

        {actions}
      </div>

      {/* Indented to the title, not the icon, so the two lines form a block.
          The gap below it — not a rule — is what separates the explanation from
          the content, so prose and list are never flush against each other. */}
      {blurb && (
        <p className={cn('mt-1.5 text-[12.5px] leading-relaxed text-ink-faint', Icon && 'pl-[24px]')}>
          {blurb}
        </p>
      )}

      <div className="mt-3.5 sm:mt-4">{children}</div>
    </section>
  );
}
