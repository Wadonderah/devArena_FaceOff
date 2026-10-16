'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, Check, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompetition, useCountdown } from '@/lib/hooks';
import { ROUND_PATH, ROUND_TYPE_NAME } from '@/lib/taxonomy';
import { useRoundProgress } from '@/components/round-progress';
import { cn } from '@/lib/cn';
import type { RoundSummary } from '@/lib/types';

const STARTED = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/// How far through the round you are.
///
/// Works for every round type now: MCQ reports answered-of-total, and a coding
/// round counts the challenges with at least one submission against them.
function Progress({ round }: { round: RoundSummary }) {
  const { attempted, total, started, loading } = useRoundProgress(round);

  // Nothing to show before they have begun — an empty bar is just a line.
  if (loading || !started || total === 0) return null;

  const pct = Math.round((attempted / total) * 100);
  const noun = round.type === 'MCQ' ? 'answered' : 'attempted';

  return (
    <div className="mt-3.5 border-t border-line pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          Your progress
        </span>
        <span className="font-mono text-[12px] tabular-nums text-ink-dim">
          {attempted} of {total} {noun}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out-expo"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/// A ticking clock for a round that has a deadline.
function Deadline({ endsAt }: { endsAt: string }) {
  const { remainingMs, label } = useCountdown(endsAt);
  if (remainingMs === null) return null;

  // Under five minutes the clock stops being information and becomes pressure,
  // which is the point — but it should look different, not just read different.
  const urgent = remainingMs < 5 * 60_000;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[13px] tabular-nums',
        urgent ? 'border-danger/40 bg-danger/10 text-danger' : 'border-live/30 bg-live/10 text-live',
      )}
    >
      {label}
      <span className="text-[10px] uppercase tracking-[0.1em] opacity-70">left</span>
    </span>
  );
}

function Opens({ startsAt }: { startsAt: string }) {
  const { remainingMs, label } = useCountdown(startsAt);
  if (remainingMs === null || remainingMs === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 font-mono text-[13px] tabular-nums text-ink-dim">
      {label}
      <span className="text-[10px] uppercase tracking-[0.1em] opacity-70">to go</span>
    </span>
  );
}

/// The way in, worded for where they actually are.
///
/// "Continue answering" was shown to everyone, including someone who had not
/// opened the round yet and someone who had already finished it. Both read as
/// the page not knowing what they had done.
function Entry({ round }: { round: RoundSummary }) {
  const { attempted, total, started, done, loading } = useRoundProgress(round);

  if (loading) return null;

  if (done) {
    return (
      <p className="mt-3.5 inline-flex items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-1.5 text-[13px] text-ink-dim">
        <Check aria-hidden size={14} strokeWidth={2.5} className="text-brand" />
        All {total} {total === 1 ? 'answer' : 'answers'} in. Nothing left to do in this round.
      </p>
    );
  }

  const label = started
    ? `Resume — ${attempted} of ${total} done`
    : round.type === 'MCQ'
      ? 'Start answering'
      : 'Enter round';

  return (
    <Link
      href={`/rounds/${round.id}/${ROUND_PATH[round.type]}`}
      className="mt-3.5 block sm:inline-block"
    >
      <Button icon={<ArrowRight />} className="w-full sm:w-auto">
        {label}
      </Button>
    </Link>
  );
}

/// The round that is happening, or the one about to.
///
/// The dashboard could already say *which* round was live, but never how long
/// was left in it or how far through it you were — the two things a competitor
/// checks most during an event.
export function LiveNow({ competitionId }: { competitionId: string }) {
  const { data } = useCompetition(competitionId);

  if (!data) return <Skeleton className="h-28 w-full rounded-xl" />;

  const live = data.rounds.find((r) => r.state === 'LIVE');
  const next = data.rounds
    .filter((r) => r.state === 'SCHEDULED' && r.startsAt)
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))[0];

  const round: RoundSummary | undefined = live ?? next;
  if (!round) return null;

  const isLive = Boolean(live);
  const opensAt = !isLive && round.startsAt && new Date(round.startsAt) > new Date()
    ? round.startsAt
    : null;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border p-4 sm:p-5',
        // The orange edge alone says "live". Tinting the whole panel as well
        // made the one thing that should be calm to read the loudest block on
        // the page.
        isLive ? 'border-live/25 bg-surface-1' : 'border-line bg-surface-1',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {isLive ? (
              <Radio aria-hidden size={13} strokeWidth={1.75} className="text-live" />
            ) : (
              <CalendarClock aria-hidden size={13} strokeWidth={1.5} />
            )}
            {isLive ? 'Happening now' : 'Up next'}
          </p>
          <h2 className="mt-1.5 truncate text-lg leading-tight">{round.name}</h2>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            {ROUND_TYPE_NAME[round.type]} · {round._count.challenges}{' '}
            {round.type === 'MCQ' ? 'questions' : 'problems'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* A round can be started without a closing time, which is most of
              them here. Saying when it opened is honest; a countdown to a
              deadline that does not exist would not be. */}
          {isLive && round.endsAt && <Deadline endsAt={round.endsAt} />}
          {isLive && !round.endsAt && round.startsAt && (
            <span className="font-mono text-[12px] text-ink-faint">
              Open since {STARTED.format(new Date(round.startsAt))}
            </span>
          )}
          {opensAt && <Opens startsAt={opensAt} />}
        </div>
      </div>

      {isLive && data.joined && <Entry round={round} />}

      {isLive && data.joined && <Progress round={round} />}
    </section>
  );
}
