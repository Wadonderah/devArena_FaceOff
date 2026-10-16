'use client';

import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotifications } from '@/lib/hooks';
import { relativeTime, safeNotificationLink, toneFor } from '@/lib/notifications';
import { cn } from '@/lib/cn';

const SHOWN = 6;

const DOT = {
  brand: 'bg-brand',
  warn: 'bg-warn',
  live: 'bg-live',
} as const;

/// What has happened lately, on the page people actually land on.
///
/// The same rows the bell shows, but the bell only reveals them on a click and
/// clears its badge the moment it opens — so during an event the history was
/// effectively write-only. Here it gives the dashboard a pulse: rounds opening,
/// scores landing, team-mates arriving.
///
/// Read state is deliberately not shown and nothing is marked read from here.
/// Walking past a list must not silently clear a notification you have not
/// actually looked at.
export function ActivityFeed() {
  const { data, isLoading } = useNotifications(true);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-4 sm:p-5">
        <Skeleton className="h-4 w-20 rounded" />
        <Skeleton className="mt-4 h-8 w-full rounded" />
        <Skeleton className="mt-2 h-8 w-full rounded" />
      </div>
    );
  }

  const items = data?.items?.slice(0, SHOWN) ?? [];
  if (items.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          Recent activity
        </h2>
      </header>

      {/* A timeline, not a list of rows. The dots were already there; joining
          them turns six separate notices into one run of events, which is what
          they are. No divider between items — the rail is the structure, and a
          second horizontal line fighting a vertical one reads as a table. */}
      <ol className="mt-3 pb-2">
        {items.map((n, i) => {
          const href = safeNotificationLink(n.linkUrl);
          const tone = toneFor(n.type);
          const last = i === items.length - 1;

          return (
            <li key={n.id} className="relative flex gap-3 px-4 sm:px-5">
              <div className="relative flex w-2.5 shrink-0 justify-center">
                {/* Runs from just under this dot to just under the next one.
                    The negative bottom carries it across the gap between list
                    items, so the rail is continuous rather than dashed. */}
                {!last && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-5 -bottom-2 w-px -translate-x-1/2 bg-line"
                  />
                )}
                {/* The ring is the panel's own background, so the rail appears
                    to pass behind the dot rather than through it. */}
                <span
                  aria-hidden
                  className={cn(
                    'relative mt-2.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface-1',
                    DOT[tone],
                  )}
                />
              </div>

              {/* The hover tint stays off the rail column, so the dot's ring
                  always matches what is behind it. */}
              {href ? (
                <Link
                  href={href}
                  className="-mx-2 min-w-0 flex-1 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2/50"
                >
                  <p className="truncate text-[13px] text-ink">{n.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{relativeTime(n.createdAt)}</p>
                </Link>
              ) : (
                <div className="min-w-0 flex-1 px-2 py-2">
                  <p className="truncate text-[13px] text-ink">{n.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">{relativeTime(n.createdAt)}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
