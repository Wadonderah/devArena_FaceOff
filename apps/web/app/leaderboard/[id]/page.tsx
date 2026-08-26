'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { use, useEffect, useRef } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { CompetitionStateBadge } from '@/components/ui/badge';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useCurrentUser, useLeaderboard } from '@/lib/hooks';
import type { LeaderboardRow } from '@/lib/types';
import { cn } from '@/lib/cn';

function formatTime(ms: number): string {
  if (ms <= 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function RankDelta({ delta }: { delta: number | undefined }) {
  if (!delta || delta === 0) {
    return <span aria-hidden className="text-ink-faint">—</span>;
  }

  const up = delta > 0;
  return (
    <span
      className={cn('tabular text-[13px] font-medium', up ? 'text-success' : 'text-danger')}
      title={up ? `Up ${delta}` : `Down ${Math.abs(delta)}`}
    >
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  );
}

function Board({ competitionId }: { competitionId: string }) {
  const { data, isLoading } = useLeaderboard(competitionId);
  const { data: me } = useCurrentUser();
  const reduceMotion = useReducedMotion();

  // Rank movement is derived client-side by diffing consecutive polls. It drives
  // the arrow indicator only — the authoritative ranking always comes from the
  // server, never from anything computed here.
  const previousRanks = useRef<Map<string, number>>(new Map());
  const deltas = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!data) return;

    const next = new Map<string, number>();
    for (const row of data.rows) {
      const before = previousRanks.current.get(row.userId);
      if (before !== undefined && before !== row.rank) {
        deltas.current.set(row.userId, before - row.rank);
      }
      next.set(row.userId, row.rank);
    }
    previousRanks.current = next;
  }, [data]);

  if (isLoading) return <SkeletonRows rows={6} />;
  if (!data) return null;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl">Leaderboard</h1>
            <CompetitionStateBadge state={data.competition.state} />
          </div>
          <p className="mt-1.5 text-[15px] text-ink-dim">{data.competition.name}</p>
        </div>

        <p className="flex items-center gap-2 text-[13px] text-ink-faint">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />
          Updating every 3 seconds
        </p>
      </header>

      {/* Live region announces only the viewer's own position, so a screen
          reader is not read the entire board on every poll. */}
      <p className="sr-only" aria-live="polite">
        {(() => {
          const mine = data.rows.find((r) => r.userId === me?.id);
          return mine ? `You are ranked ${mine.rank} of ${data.rows.length}.` : '';
        })()}
      </p>

      <div className="panel hairline overflow-hidden">
        <div className="grid grid-cols-[3rem_1fr_4rem_5.5rem_6rem] gap-3 border-b border-line px-4 py-2.5 text-[11px] uppercase tracking-[0.08em] text-ink-faint sm:px-5">
          <span>Rank</span>
          <span>Participant</span>
          <span className="text-right">Move</span>
          <span className="text-right">Solved</span>
          <span className="text-right">Score</span>
        </div>

        {data.rows.length === 0 ? (
          <p className="p-10 text-center text-[14px] text-ink-dim">
            No participants have joined yet.
          </p>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {data.rows.map((row: LeaderboardRow) => {
                const isMe = row.userId === me?.id;

                return (
                  <motion.li
                    key={row.userId}
                    layout={reduceMotion ? false : 'position'}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className={cn(
                      'grid grid-cols-[3rem_1fr_4rem_5.5rem_6rem] items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 sm:px-5',
                      isMe && 'bg-brand/[0.07]',
                    )}
                  >
                    <span
                      className={cn(
                        'tabular font-display text-lg',
                        row.rank === 1 && 'text-warn',
                        row.rank === 2 && 'text-ink-dim',
                        row.rank === 3 && 'text-live',
                      )}
                    >
                      {row.rank}
                    </span>

                    <span className="min-w-0 truncate text-[15px]">
                      {row.displayName}
                      {isMe && (
                        <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-brand/20 text-brand-bright">
                          You
                        </span>
                      )}
                      <span className="block text-[12px] text-ink-faint">
                        {formatTime(row.totalTimeMs)}
                      </span>
                    </span>

                    <span className="text-right">
                      <RankDelta delta={deltas.current.get(row.userId)} />
                    </span>

                    <span className="tabular text-right text-[15px] text-ink-dim">
                      {row.completedChallenges}
                    </span>

                    <span className="tabular text-right font-mono text-[15px]">
                      {row.finalScore.toFixed(4)}
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-faint">
        Ties are broken by challenges completed, then total time, then who reached
        the score first.
      </p>
    </>
  );
}

export default function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <Shell>
        <Board competitionId={id} />
      </Shell>
    </AuthGate>
  );
}
