'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface PreviewTeam {
  id: string;
  name: string;
  score: number;
}

// Deliberately fictional teams. This runs on the public landing page for signed-out
// visitors, so it makes no API calls — there may be no competition running at all,
// and a marketing page must never depend on live data to render.
const SEED: PreviewTeam[] = [
  { id: 'phoenix', name: 'Team Phoenix', score: 1420 },
  { id: 'akwaba', name: 'Team Akwaba', score: 1390 },
  { id: 'horizon', name: 'Team Horizon', score: 1310 },
  { id: 'builders', name: 'Team Builders', score: 1255 },
  { id: 'sankofa', name: 'Team Sankofa', score: 1180 },
];

const TICK_MS = 2600;
const START_SECONDS = 8 * 60 + 41;

export function LivePreview() {
  const reduceMotion = useReducedMotion();
  const [teams, setTeams] = useState(SEED);
  const [seconds, setSeconds] = useState(START_SECONDS);
  const previousRanks = useRef(new Map(SEED.map((t, i) => [t.id, i + 1])));
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  // A static board is the honest presentation when motion is reduced — the point
  // of the animation is to show movement, and faking it without motion would
  // just be noise.
  useEffect(() => {
    if (reduceMotion) return;

    const timer = setInterval(() => {
      setTeams((current) => {
        // Award points to one team, the way a real submission landing would.
        const luckyIndex = Math.floor(Math.random() * current.length);
        const gain = 15 + Math.floor(Math.random() * 60);

        const scored = current.map((team, i) =>
          i === luckyIndex ? { ...team, score: team.score + gain } : team,
        );

        const ordered = [...scored].sort((a, b) => b.score - a.score);

        const nextDeltas: Record<string, number> = {};
        ordered.forEach((team, index) => {
          const before = previousRanks.current.get(team.id);
          const now = index + 1;
          if (before !== undefined && before !== now) nextDeltas[team.id] = before - now;
          previousRanks.current.set(team.id, now);
        });

        setDeltas(nextDeltas);
        return ordered;
      });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : START_SECONDS)), 1000);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const clock = useMemo(() => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [seconds]);

  return (
    // Presentational throughout: a screen reader gets the surrounding copy, which
    // says the same thing without a per-second countdown fighting it.
    <div
      aria-hidden
      className="bracketed relative select-none overflow-hidden rounded-[14px] border border-line bg-surface-0/80 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-1/60 px-4 py-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-live/40 bg-live/15 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-live">
          <span className="relative flex size-1.5">
            {!reduceMotion && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-70" />
            )}
            <span className="relative inline-flex size-1.5 rounded-full bg-current" />
          </span>
          Live · Round 2
        </span>
        <span className="tabular font-mono text-[15px] text-live">{clock}</span>
      </div>

      <ul className="divide-y divide-line/60">
        <AnimatePresence initial={false}>
          {teams.map((team, index) => {
            const rank = index + 1;
            const delta = deltas[team.id];

            return (
              <motion.li
                key={team.id}
                layout={reduceMotion ? false : 'position'}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className={cn(
                  'grid grid-cols-[2.75rem_1fr_3rem_4.5rem] items-center gap-3 px-4 py-2.5',
                  rank === 1 && 'bg-live/[0.05]',
                )}
              >
                <span className="flex items-center gap-2">
                  {/* A leading rule on the top position — the visual equivalent
                      of a spotlight on the leader. */}
                  <span
                    className={cn(
                      'h-4 w-0.5 rounded-full',
                      rank === 1 ? 'bg-live' : 'bg-transparent',
                    )}
                  />
                  <span
                    className={cn(
                      'tabular font-display text-[21px] font-bold leading-none',
                      rank === 1 && 'text-ink',
                      rank === 2 && 'text-ink-dim',
                      rank === 3 && 'text-ink-dim',
                      rank > 3 && 'text-ink-faint',
                    )}
                  >
                    {rank}
                  </span>
                </span>

                <span className="truncate text-[14px] text-ink">{team.name}</span>

                <span className="text-right text-[12px] font-medium">
                  {delta ? (
                    <span className={delta > 0 ? 'text-success' : 'text-danger'}>
                      {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </span>

                <motion.span
                  key={team.score}
                  initial={reduceMotion ? false : { color: 'var(--color-live)' }}
                  animate={{ color: 'var(--color-ink)' }}
                  transition={{ duration: 1.1 }}
                  className="tabular text-right font-mono text-[14px]"
                >
                  {team.score.toLocaleString()}
                </motion.span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <p className="border-t border-line bg-surface-1/40 px-4 py-2.5 font-mono text-[11px] tracking-wide text-ink-faint">
        Ranks update the moment a submission is scored
      </p>
    </div>
  );
}
