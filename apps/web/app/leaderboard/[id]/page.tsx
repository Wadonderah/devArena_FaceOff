'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { use, useEffect, useRef, useState } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { CompetitionStateBadge } from '@/components/ui/badge';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCurrentUser, useLeaderboard } from '@/lib/hooks';
import type { LeaderboardRow, TeamLeaderboard } from '@/lib/types';
import { cn } from '@/lib/cn';
import { formatScore } from '@/lib/score-format';

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

function TeamBoard({ competitionId }: { competitionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard-teams', competitionId],
    queryFn: () => api<TeamLeaderboard>(`/leaderboard/${competitionId}/teams`),
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  if (isLoading) return <SkeletonRows rows={5} />;
  if (!data) return null;

  if (data.rows.length === 0) {
    return (
      <div className="panel p-10 text-center text-[14px] text-ink-dim">
        No teams have been created for this competition yet.
      </div>
    );
  }

  return (
    <div className="panel hairline overflow-hidden">
      {/* The columns were all fixed widths — 19.5rem of them plus gaps and
          padding, about 392px, which overflowed a 390px phone. Members and
          Solved are the two a participant can do without on a narrow screen, so
          they drop out and the rest get the room. */}
      <div className="grid grid-cols-[2.25rem_1fr_auto] gap-3 border-b border-line px-4 py-2.5 text-[11px] uppercase tracking-[0.08em] text-ink-faint sm:grid-cols-[3rem_1fr_4rem_4rem_auto] sm:px-5">
        <span>Rank</span>
        <span>Team</span>
        <span className="hidden text-right sm:block">Members</span>
        <span className="hidden text-right sm:block">Solved</span>
        <span className="text-right">Score</span>
      </div>

      <ul>
        {data.rows.map((row) => (
          <li
            key={row.teamId}
            className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 sm:grid-cols-[3rem_1fr_4rem_4rem_auto] sm:px-5"
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
              {row.name}
              <span className="block text-[12px] text-ink-faint">
                {formatTime(row.totalTimeMs)}
              </span>
            </span>
            <span className="tabular hidden text-right text-[15px] text-ink-dim sm:block">
              {row.memberCount}
            </span>
            <span className="tabular hidden text-right text-[15px] text-ink-dim sm:block">
              {row.completedChallenges}
            </span>
            {/* A percentage, not the raw 0.4000 fraction. Same family as the
                rest of the row rather than font-mono, which made the one number
                on the line look like it belonged to a different design. */}
            <span className="tabular text-right text-[15px] font-medium">
              {formatScore(row.finalScore)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Board({ competitionId }: { competitionId: string }) {
  const [view, setView] = useState<'individual' | 'teams'>('individual');
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

        <div className="flex flex-col items-end gap-2">
          <div
            role="group"
            aria-label="Leaderboard view"
            className="inline-flex rounded-lg border border-line bg-surface-1 p-0.5"
          >
            {(['individual', 'teams'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] capitalize transition-colors duration-150',
                  view === mode ? 'bg-surface-3 text-ink' : 'text-ink-dim hover:text-ink',
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <p className="flex items-center gap-2 text-[13px] text-ink-faint">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />
            Updating every 3 seconds
          </p>
        </div>
      </header>

      {view === 'teams' && <TeamBoard competitionId={competitionId} />}

      {/* Live region announces only the viewer's own position, so a screen
          reader is not read the entire board on every poll. */}
      <p className="sr-only" aria-live="polite">
        {(() => {
          const mine = data.rows.find((r) => r.userId === me?.id);
          return mine ? `You are ranked ${mine.rank} of ${data.rows.length}.` : '';
        })()}
      </p>

      <div className={cn('panel hairline overflow-hidden', view === 'teams' && 'hidden')}>
        {/* Same fix as the team board: Move and Solved step aside on a phone
            rather than pushing the row past the viewport. */}
        <div className="grid grid-cols-[2.25rem_1fr_auto] gap-3 border-b border-line px-4 py-2.5 text-[11px] uppercase tracking-[0.08em] text-ink-faint sm:grid-cols-[3rem_1fr_3.5rem_4rem_auto] sm:px-5">
          <span>Rank</span>
          <span>Participant</span>
          <span className="hidden text-right sm:block">Move</span>
          <span className="hidden text-right sm:block">Solved</span>
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
                      'grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0 sm:grid-cols-[3rem_1fr_3.5rem_4rem_auto] sm:px-5',
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

                    <span className="hidden text-right sm:block">
                      <RankDelta delta={deltas.current.get(row.userId)} />
                    </span>

                    <span className="tabular hidden text-right text-[15px] text-ink-dim sm:block">
                      {row.completedChallenges}
                    </span>

                    <span className="tabular text-right text-[15px] font-medium">
                      {formatScore(row.finalScore)}
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
