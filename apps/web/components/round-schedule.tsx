'use client';

import { Check } from 'lucide-react';
import { RoundStateBadge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompetition } from '@/lib/hooks';
import { ROUND_TYPE_NAME } from '@/lib/taxonomy';
import { RoundProgressAction } from '@/components/round-progress';
import { cn } from '@/lib/cn';

/// Every round in the competition, in order, with where it has got to.
///
/// The dashboard previously showed one round — whichever was live or next — so
/// a participant could see what was happening but never what was coming. Three
/// rounds in a season is the whole shape of the event, and it was the one thing
/// the page knew and did not say.
export function RoundSchedule({ competitionId }: { competitionId: string }) {
  const { data } = useCompetition(competitionId);

  if (!data) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-4 sm:p-5">
        <Skeleton className="h-4 w-28 rounded" />
        <Skeleton className="mt-4 h-11 w-full rounded" />
        <Skeleton className="mt-2 h-11 w-full rounded" />
      </div>
    );
  }

  if (data.rounds.length === 0) return null;

  const ordered = [...data.rounds].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          Rounds
        </h2>
        <span className="text-[12px] text-ink-faint">
          {ordered.length} in this competition
        </span>
      </header>

      <ol className="mt-3 divide-y divide-line">
        {ordered.map((round, i) => {
          const isLive = round.state === 'LIVE';
          const done = round.state === 'FINALIZED' || round.state === 'ARCHIVED';
          const enterable = isLive && Boolean(data.joined);

          return (
            <li
              key={round.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 sm:px-5',
                isLive ? 'bg-live/[0.04]' : '',
              )}
            >
              {/* The index doubles as the progress marker: a tick once the round
                  is settled, so the column reads as a sequence rather than as a
                  repeated bullet. */}
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[11px] tabular-nums',
                  done
                    ? 'border-line bg-surface-2 text-ink-dim'
                    : isLive
                      ? 'border-live/40 bg-live/10 text-live'
                      : 'border-line bg-surface-2 text-ink-faint',
                )}
              >
                {done ? <Check aria-hidden size={12} strokeWidth={2.5} /> : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="truncate text-[14px] font-medium text-ink">{round.name}</h3>
                  <RoundStateBadge state={round.state} />
                </div>
                <p className="mt-0.5 text-[12px] text-ink-faint">
                  {ROUND_TYPE_NAME[round.type]} · {round._count.challenges}{' '}
                  {round.type === 'MCQ' ? 'questions' : 'problems'}
                </p>
              </div>

              {/* Whether they have been in already decides what this says —
                  "Enter" offered to someone who has answered every question
                  reads as though their work did not register. */}
              <RoundProgressAction round={round} canEnter={enterable} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
