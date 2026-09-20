'use client';

import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface MockTeam {
  id: string;
  name: string;
  score: number;
}

// Deliberately fictional teams. This runs on the public landing page for signed-out
// visitors, so it makes no API calls — there may be no competition running at all,
// and a marketing page must never depend on live data to render.
const SEED: MockTeam[] = [
  { id: 'phoenix', name: 'Team Phoenix', score: 1420 },
  { id: 'akwaba', name: 'Team Akwaba', score: 1390 },
  { id: 'horizon', name: 'Team Horizon', score: 1310 },
  { id: 'builders', name: 'Team Builders', score: 1255 },
  { id: 'sankofa', name: 'Team Sankofa', score: 1180 },
];

const TICK_MS = 2600;
const START_SECONDS = 8 * 60 + 41;

/// A small fictional competition that keeps moving.
///
/// Extracted from the old leaderboard mock so the arena illustration and any
/// future preview share one source of standings. Every tick awards points to
/// one team, the way a real submission landing would, and reports who moved.
export function useMockStandings() {
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

  return { teams, deltas, clock, reduceMotion };
}
