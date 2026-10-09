'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { use, useEffect, useRef, useState } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { CompetitionStateBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Podium, type PodiumEntry } from '@/components/leaderboard-podium';
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

/// Places gained or lost since the previous poll.
///
/// Lucide rather than the characters ▲ ▼, for the reason the theme toggle and
/// the toasts both gave up their glyphs: the triangles rendered at whatever
/// weight and baseline the surrounding font happened to supply, so they never
/// sat level with the number beside them or matched any other icon on screen.
function RankDelta({ delta }: { delta: number | undefined }) {
  if (!delta || delta === 0) {
    return (
      <span aria-hidden className="text-ink-faint">
        —
      </span>
    );
  }

  const up = delta > 0;
  const Icon = up ? ChevronUp : ChevronDown;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-0.5 text-[13px] font-medium tabular-nums',
        up ? 'text-success' : 'text-danger',
      )}
      title={up ? `Up ${delta}` : `Down ${Math.abs(delta)}`}
    >
      <Icon aria-hidden size={13} strokeWidth={2.25} />
      {Math.abs(delta)}
    </span>
  );
}

/// Rank numeral, medal-coloured for the top three.
///
/// Third place used to be rendered in `live` orange — the colour reserved for
/// "a round is running right now" — simply because it was the nearest warm
/// token to hand. The metals exist so each place can be itself without
/// borrowing a status colour.
function RankNumber({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        'font-display text-lg tabular-nums',
        rank === 1
          ? 'text-medal-gold'
          : rank === 2
            ? 'text-medal-silver'
            : rank === 3
              ? 'text-medal-bronze'
              : 'text-ink-faint',
      )}
    >
      {rank}
    </span>
  );
}

/// An initial tile per row.
///
/// Forty rows of text at one size is why the board read as a spreadsheet. A
/// small fixed shape per row gives the eye something to count along, and it is
/// the same device the rail and the dashboard already use for identity.
function Avatar({ name, highlight }: { name: string; highlight?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-md text-[12px] font-semibold',
        highlight ? 'bg-brand text-white' : 'bg-surface-3 text-ink-dim',
      )}
    >
      {name.charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/// How far along the leader this score is, drawn behind the row.
///
/// A column of percentages tells you the numbers but not the shape of the
/// contest — whether the field is close or the leader has run away with it is
/// the single most interesting thing on a leaderboard, and it was invisible.
/// Deliberately very low contrast: this is a texture to be felt while reading
/// the names, not a chart to be measured.
function ScoreBar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;

  return (
    <span
      aria-hidden
      // `-z-10` inside the row's own `isolate`, so it sits behind the row's
      // content without escaping to behind the panel.
      className="absolute inset-y-0 left-0 -z-10 bg-gradient-to-r from-brand/[0.10] to-brand/[0.02]"
      style={{ width: `${pct}%` }}
    />
  );
}

/// The viewer's own position, pinned above the table.
///
/// Past the first screenful the one row anyone actually wants is their own, and
/// finding it meant scrolling a list that reorders underneath you while you
/// look. Shown only outside the top three, because inside them the podium is
/// already doing it.
function YourPosition({
  rank,
  total,
  score,
}: {
  rank: number;
  total: number;
  score: number;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4 rounded-xl border border-brand/35 bg-brand/[0.07] px-4 py-2.5">
      <span className="flex items-center gap-2.5">
        <span className="font-display text-lg tabular-nums text-brand-bright">{rank}</span>
        <span className="text-[13px] text-ink-dim">
          Your position
          <span aria-hidden className="mx-1.5 text-line-bright">
            ·
          </span>
          <span className="tabular-nums text-ink-faint">of {total}</span>
        </span>
      </span>
      <span className="font-display text-lg font-semibold tabular-nums">
        {formatScore(score)}
      </span>
    </div>
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
      <div className="panel p-6 sm:p-10 text-center text-[14px] text-ink-dim">
        No teams have been created for this competition yet.
      </div>
    );
  }

  const topScore = data.rows[0]?.finalScore ?? 0;

  const podiumEntries: PodiumEntry[] = data.rows
    .filter((row) => row.rank <= 3)
    .map((row) => ({
      id: row.teamId,
      rank: row.rank,
      name: row.name,
      score: row.finalScore,
      detail: `${row.memberCount} ${row.memberCount === 1 ? 'member' : 'members'}`,
    }));

  return (
    <>
      {/* Same treatment as the individual board. A team competition without a
          podium was the odd one out, and teams are the format the event is
          actually scored on. */}
      <Podium entries={podiumEntries} />

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
            className="relative isolate grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-0 sm:grid-cols-[3rem_1fr_4rem_4rem_auto] sm:px-5"
          >
            <ScoreBar fraction={topScore > 0 ? row.finalScore / topScore : 0} />

            <RankNumber rank={row.rank} />

            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar name={row.name} />
              <span className="min-w-0">
                <span className="block truncate text-[14px]">{row.name}</span>
                <span className="block text-[11.5px] tabular-nums text-ink-faint">
                  {formatTime(row.totalTimeMs)}
                </span>
              </span>
            </span>

            <span className="hidden text-right text-[14px] tabular-nums text-ink-dim sm:block">
              {row.memberCount}
            </span>
            <span className="hidden text-right text-[14px] tabular-nums text-ink-dim sm:block">
              {row.completedChallenges}
            </span>
            {/* A percentage, not the raw 0.4000 fraction. Same family as the
                rest of the row rather than font-mono, which made the one number
                on the line look like it belonged to a different design. */}
            <span className="text-right font-display text-[15px] font-semibold tabular-nums">
              {formatScore(row.finalScore)}
            </span>
          </li>
        ))}
      </ul>
      </div>
    </>
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

  // The leader's score is the scale every bar is drawn against, so a runaway
  // leader makes everyone else's bar visibly short — which is the information.
  const topScore = data.rows[0]?.finalScore ?? 0;
  const mine = data.rows.find((row) => row.userId === me?.id);

  const podiumEntries: PodiumEntry[] = data.rows
    .filter((row) => row.rank <= 3)
    .map((row) => ({
      id: row.userId,
      rank: row.rank,
      name: row.displayName,
      score: row.finalScore,
      detail: formatTime(row.totalTimeMs),
      isMe: row.userId === me?.id,
    }));

  return (
    <>
      <PageHeader
        title="Leaderboard"
        badge={<CompetitionStateBadge state={data.competition.state} />}
        subtitle={data.competition.name}
        actions={
          /* The "Updating every 3 seconds" line that used to sit beneath this
             toggle is gone. It described the implementation rather than saying
             anything a participant could act on, and it invited the reader to
             watch a clock instead of the board. The standings keep themselves
             current; nobody needs telling how often. */
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
        }
      />

      {view === 'teams' && <TeamBoard competitionId={competitionId} />}

      {/* Live region announces only the viewer's own position, so a screen
          reader is not read the entire board on every poll. */}
      <p className="sr-only" aria-live="polite">
        {mine ? `You are ranked ${mine.rank} of ${data.rows.length}.` : ''}
      </p>

      {view === 'individual' && (
        <>
          <Podium entries={podiumEntries} />
          {mine && mine.rank > 3 && (
            <YourPosition rank={mine.rank} total={data.rows.length} score={mine.finalScore} />
          )}
        </>
      )}

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
          <p className="p-6 sm:p-10 text-center text-[14px] text-ink-dim">
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
                    // `isolate` contains the score bar's negative z-index.
                    className={cn(
                      'relative isolate grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-0 sm:grid-cols-[3rem_1fr_3.5rem_4rem_auto] sm:px-5',
                      isMe && 'bg-brand/[0.07]',
                    )}
                  >
                    <ScoreBar fraction={topScore > 0 ? row.finalScore / topScore : 0} />

                    <RankNumber rank={row.rank} />

                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={row.displayName} highlight={isMe} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              'truncate text-[14px]',
                              isMe ? 'font-medium text-ink' : 'text-ink',
                            )}
                          >
                            {row.displayName}
                          </span>
                          {isMe && (
                            <span className="shrink-0 rounded-full bg-brand/20 px-1.5 py-0.5 text-[10px] font-medium text-brand-bright">
                              You
                            </span>
                          )}
                        </span>
                        <span className="block text-[11.5px] tabular-nums text-ink-faint">
                          {formatTime(row.totalTimeMs)}
                        </span>
                      </span>
                    </span>

                    <span className="hidden text-right sm:block">
                      <RankDelta delta={deltas.current.get(row.userId)} />
                    </span>

                    <span className="hidden text-right text-[14px] tabular-nums text-ink-dim sm:block">
                      {row.completedChallenges}
                    </span>

                    <span className="text-right font-display text-[15px] font-semibold tabular-nums">
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
