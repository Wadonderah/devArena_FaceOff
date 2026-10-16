'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser, useLeaderboard } from '@/lib/hooks';
import { formatScore, placing } from '@/lib/score-format';
import { cn } from '@/lib/cn';

/// Thirty seconds, not the three the leaderboard page uses. This is a glance on
/// a page nobody watches during a round; polling it as hard as the live board
/// would triple the request count for a number that barely moves here.
const POLL_MS = 30_000;

const MEDAL = ['text-medal-gold', 'text-medal-silver', 'text-medal-bronze'];

/// Where the participant stands, and who is ahead.
///
/// The dashboard knew the competition and the team but never the one number a
/// competitor actually opens a leaderboard for. Renders nothing until somebody
/// has scored, since a board of zeros says less than no board at all.
export function StandingCard({ competitionId }: { competitionId: string }) {
  const { data: user } = useCurrentUser();
  const { data: board, isLoading } = useLeaderboard(competitionId, POLL_MS);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-4 sm:p-5">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="mt-4 h-9 w-full rounded" />
        <Skeleton className="mt-2 h-9 w-full rounded" />
      </div>
    );
  }

  const rows = board?.rows ?? [];
  if (rows.length === 0) return null;

  const mine = rows.find((r) => r.userId === user?.id);
  const top = rows.slice(0, 3);
  // Only worth repeating the participant's own row when it is not already in
  // the three above.
  const showMine = mine && !top.some((r) => r.userId === mine.userId);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          Standings
        </h2>
        <Link
          href={`/leaderboard/${competitionId}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-dim hover:text-ink"
        >
          Full board
          <ArrowRight aria-hidden size={12} strokeWidth={2} />
        </Link>
      </header>

      {mine && (
        <div className="mx-4 mt-3 rounded-lg border border-brand/25 bg-brand/[0.06] px-3 py-2.5 sm:mx-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">You</p>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-[17px] font-medium text-ink">
              {placing(mine.rank, rows.length)}
            </span>
            <span className="font-mono text-[15px] tabular-nums text-brand">
              {formatScore(mine.finalScore)}
            </span>
          </div>
        </div>
      )}

      <ol className="mt-3 divide-y divide-line">
        {top.map((row, i) => (
          <li
            key={row.userId}
            className={cn(
              'flex items-center gap-2.5 px-4 py-2.5 sm:px-5',
              row.userId === user?.id ? 'bg-brand/[0.04]' : '',
            )}
          >
            <span
              className={cn(
                'w-4 shrink-0 text-center font-mono text-[12px] tabular-nums',
                MEDAL[i] ?? 'text-ink-faint',
              )}
            >
              {row.rank}
            </span>
            <Avatar name={row.displayName} size={22} tone="muted" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-dim">
              {row.displayName}
            </span>
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-faint">
              {formatScore(row.finalScore)}
            </span>
          </li>
        ))}

        {showMine && mine && (
          <li className="flex items-center gap-2.5 bg-brand/[0.04] px-4 py-2.5 sm:px-5">
            <span className="w-4 shrink-0 text-center font-mono text-[12px] tabular-nums text-ink-faint">
              {mine.rank}
            </span>
            <Avatar name={mine.displayName} size={22} tone="muted" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-dim">
              {mine.displayName}
            </span>
            <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-faint">
              {formatScore(mine.finalScore)}
            </span>
          </li>
        )}
      </ol>
    </section>
  );
}
