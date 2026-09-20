'use client';

import { motion, useAnimationFrame, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import { useMockStandings, type MockTeam } from '@/lib/use-mock-standings';
import { dustField } from '@/lib/dust';

/// The arena: an isometric stadium bowl with the field's teams orbiting it.
///
/// Built as geometry rather than an image so it follows the theme toggle,
/// stays crisp at any size, and can be handed real standings later — the
/// audience page will want exactly this with live data.
///
/// Composition rules borrowed from the reference illustration: one light
/// source (the column from above), one accent colour (the orange LIVE mark),
/// one subject. Everything else is tone-on-tone so the eye lands where the
/// contest is.

const W = 800;
const H = 560;
const CX = 400;
const CY = 330;
// Isometric squash: an ellipse this flat reads as a circle seen from a stand.
const K = 0.42;

// The bowl. The outer rim is highest and widest; every seat row inward is
// smaller and sits LOWER on screen, so the stands descend to the floor. (A
// pedestal, like the trophy in the reference, would do the opposite.)
const RIM = { rx: 190, dy: -30, wall: 46 };
const ROWS = [
  { rx: 158, dy: -18 },
  { rx: 126, dy: -7 },
  { rx: 96, dy: 3 },
];
const FLOOR = { rx: 66, dy: 12 };
// Height of each step's vertical face, visible on the far side only.
const RISER = 9;

// Orbit radii by rank: the leader circles closest to the floor.
const ORBITS = [222, 268, 316, 366, 418];

// Where each team starts on its ring, spread so labels never overlap.
const BASE_ANGLE: Record<string, number> = {
  phoenix: 0.35,
  akwaba: 1.7,
  horizon: 2.9,
  builders: 4.1,
  sankofa: 5.3,
};

// Radians per second along a ring. A full lap takes over two minutes; the
// motion is felt, not watched.
const DRIFT = 0.024;

const DUST = dustField(96, 20260919, W, H * 0.78);

/// The near face of a short elliptical cylinder: the outer wall of the bowl.
/// Top edge is the near half of the rim ellipse; bottom edge is the same half
/// dropped by `h`. Sweep flags follow SVG's y-down convention.
function drumPath(cx: number, cy: number, rx: number, ry: number, h: number): string {
  return [
    `M ${cx - rx} ${cy}`,
    `A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`,
    `L ${cx + rx} ${cy + h}`,
    `A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy + h}`,
    'Z',
  ].join(' ');
}

export function Arena() {
  const { teams, clock, reduceMotion } = useMockStandings();

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        aria-hidden
        focusable="false"
      >
        <defs>
          <linearGradient id="arena-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--arena-sky-top)" />
            <stop offset="1" stopColor="var(--arena-wall-shadow)" />
          </linearGradient>

          {/* The key light: teal, off-centre and above, like a single stadium lamp. */}
          <radialGradient id="arena-key" cx="0.5" cy="0.42" r="0.5">
            <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.28" />
            <stop offset="0.55" stopColor="var(--color-brand)" stopOpacity="0.06" />
            <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="arena-floor" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--color-brand-bright)" stopOpacity="0.95" />
            <stop offset="0.6" stopColor="var(--color-brand)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--color-brand-deep)" stopOpacity="0.25" />
          </radialGradient>

          <linearGradient id="arena-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-brand-bright)" stopOpacity="0" />
            <stop offset="0.7" stopColor="var(--color-brand-bright)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--color-brand-bright)" stopOpacity="0.9" />
          </linearGradient>

          {/* The outer wall, lit from the left where the key light falls. */}
          <linearGradient id="arena-wall" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--arena-tier)" />
            <stop offset="0.5" stopColor="var(--arena-tier-deep)" />
            <stop offset="1" stopColor="var(--arena-sky-bottom)" />
          </linearGradient>

          {/* The only filter on the page. Blur is expensive; one glow is enough. */}
          <filter id="arena-glow" x="-60%" y="-120%" width="220%" height="340%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* ── Sky ─────────────────────────────────────────────────────── */}
        <rect width={W} height={H} fill="url(#arena-sky)" />
        <g fill="var(--arena-dust)">
          {DUST.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              opacity={d.o}
              className={i % 2 ? 'hidden sm:inline' : undefined}
            />
          ))}
        </g>
        <ellipse cx={CX} cy={CY} rx={420} ry={260} fill="url(#arena-key)" />

        {/* ── Orbits ──────────────────────────────────────────────────── */}
        <g fill="none" stroke="var(--arena-ring)">
          {ORBITS.map((rx, i) => (
            <ellipse
              key={rx}
              cx={CX}
              cy={CY}
              rx={rx}
              ry={rx * K}
              strokeWidth={i === 0 ? 1.1 : 0.8}
              strokeOpacity={1 - i * 0.14}
            />
          ))}
        </g>

        {/* ── Stadium ─────────────────────────────────────────────────── */}
        <g>
          {/* Outer wall, then the rim's top surface. */}
          <path
            d={drumPath(CX, CY + RIM.dy, RIM.rx, RIM.rx * K, RIM.wall)}
            fill="url(#arena-wall)"
            stroke="var(--color-brand)"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
          <ellipse
            cx={CX}
            cy={CY + RIM.dy}
            rx={RIM.rx}
            ry={RIM.rx * K}
            fill="var(--arena-tier)"
            stroke="var(--color-brand)"
            strokeOpacity={0.6}
            strokeWidth={1.2}
          />
          <SeatRow cx={CX} cy={CY + RIM.dy} rx={RIM.rx - 8} />

          {/* Each row inward: its riser (the same ellipse lifted by RISER, in
              the dark tone) and then the seat surface on top. The dark crescent
              left showing on the far side is the vertical step face. */}
          {ROWS.map((row, i) => (
            <g key={i}>
              <ellipse
                cx={CX}
                cy={CY + row.dy - RISER}
                rx={row.rx}
                ry={row.rx * K}
                fill="var(--arena-tier-deep)"
              />
              <ellipse
                cx={CX}
                cy={CY + row.dy}
                rx={row.rx}
                ry={row.rx * K}
                fill={i % 2 ? 'var(--arena-tier-deep)' : 'var(--arena-tier)'}
                stroke="var(--color-brand)"
                strokeOpacity={0.45}
                strokeWidth={1}
              />
              <SeatRow cx={CX} cy={CY + row.dy} rx={row.rx - 8} />
            </g>
          ))}

          {/* The last riser down to the floor. */}
          <ellipse
            cx={CX}
            cy={CY + FLOOR.dy - RISER}
            rx={FLOOR.rx}
            ry={FLOOR.rx * K}
            fill="var(--arena-tier-deep)"
          />

          {/* Light column, painted over the tiers so it lands on the floor
              rather than vanishing behind the far stands. */}
          <rect x={CX - 22} y={0} width={44} height={CY + FLOOR.dy} fill="url(#arena-beam)" opacity={0.14} />
          <rect x={CX - 1} y={0} width={2} height={CY + FLOOR.dy} fill="url(#arena-beam)" />

          {/* Floor glow, then the floor. */}
          <ellipse
            cx={CX}
            cy={CY + FLOOR.dy}
            rx={FLOOR.rx + 18}
            ry={(FLOOR.rx + 18) * K}
            fill="var(--color-brand)"
            opacity={0.55}
            filter="url(#arena-glow)"
          />
          <ellipse
            cx={CX}
            cy={CY + FLOOR.dy}
            rx={FLOOR.rx}
            ry={FLOOR.rx * K}
            fill="url(#arena-floor)"
            stroke="var(--color-brand-bright)"
            strokeOpacity={0.8}
            strokeWidth={1.2}
          />

          {/* The single accent: something is happening here, now. */}
          <LivePulse cx={CX} cy={CY + FLOOR.dy} reduce={reduceMotion} />
        </g>

        {/* ── Teams ───────────────────────────────────────────────────── */}
        <g>
          {teams.map((team, rank) => (
            <TeamNode key={team.id} team={team} rank={rank} reduce={reduceMotion} />
          ))}
        </g>

        {/* Round clock, bottom-left, in the same register as the console strip. */}
        <g fontFamily="var(--font-mono)" fontSize="12" letterSpacing="0.14em">
          <text x={28} y={H - 26} fill="var(--color-live)" fontWeight="600">
            LIVE · ROUND 2
          </text>
          <text x={W - 28} y={H - 26} fill="var(--color-ink-dim)" textAnchor="end">
            {clock}
          </text>
        </g>
      </svg>

      {/* The same information, for readers who do not get the picture. */}
      <ol className="sr-only" aria-live="off">
        {teams.map((team, i) => (
          <li key={team.id}>
            {i + 1}. {team.name}, {team.score} points
          </li>
        ))}
      </ol>
    </div>
  );
}

/// A dashed ring just inside a tier's edge: rows of seats, at this scale.
function SeatRow({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={rx * K}
      fill="none"
      stroke="var(--color-brand-bright)"
      strokeOpacity={0.28}
      strokeWidth={2.4}
      strokeDasharray="2.5 5.5"
    />
  );
}

function LivePulse({ cx, cy, reduce }: { cx: number; cy: number; reduce: boolean | null }) {
  return (
    <g>
      {!reduce && (
        <motion.ellipse
          cx={cx}
          cy={cy}
          rx={6}
          ry={6 * K}
          fill="none"
          stroke="var(--color-live)"
          strokeWidth={1.5}
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 4.5, opacity: 0 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
      )}
      <circle cx={cx} cy={cy} r={4} fill="var(--color-live)" />
      <circle cx={cx} cy={cy} r={8} fill="var(--color-live)" opacity={0.25} />
    </g>
  );
}

function TeamNode({
  team,
  rank,
  reduce,
}: {
  team: MockTeam;
  rank: number;
  reduce: boolean | null;
}) {
  const base = BASE_ANGLE[team.id] ?? 0;
  const targetRx = ORBITS[Math.min(rank, ORBITS.length - 1)];

  // The radius eases between rings when a team overtakes; the angle keeps
  // drifting underneath, so the move reads as a glide inward, not a jump.
  const rx = useSpring(targetRx, { stiffness: 60, damping: 18, mass: 1.2 });

  const x = useMotionValue(CX + targetRx * Math.cos(base));
  const y = useMotionValue(CY + targetRx * K * Math.sin(base));

  useEffect(() => {
    if (reduce) {
      // No spring, no drift: the node simply sits on its new ring.
      rx.jump(targetRx);
      x.set(CX + targetRx * Math.cos(base));
      y.set(CY + targetRx * K * Math.sin(base));
      return;
    }
    rx.set(targetRx);
  }, [targetRx, reduce, rx, x, y, base]);

  useAnimationFrame((t) => {
    if (reduce) return;
    const θ = base + (t / 1000) * DRIFT;
    const r = rx.get();
    x.set(CX + r * Math.cos(θ));
    y.set(CY + r * K * Math.sin(θ));
  });

  const leader = rank === 0;
  const label = useMemo(() => team.name.replace(/^Team /, ''), [team.name]);

  return (
    <motion.g style={{ x, y }}>
      {/* Far side of the ring passes behind the stadium; a halo keeps the node
          legible against tier edges without needing a second colour. */}
      <circle r={leader ? 9 : 7} fill="var(--arena-sky-bottom)" opacity={0.85} />
      <circle
        r={leader ? 5 : 3.6}
        fill={leader ? 'var(--color-brand-bright)' : 'var(--color-ink-dim)'}
      />
      {leader && (
        <circle r={5} fill="none" stroke="var(--color-brand-bright)" strokeOpacity={0.5} strokeWidth={3} />
      )}
      <text
        x={leader ? 12 : 10}
        y={4}
        className="hidden sm:inline"
        fontFamily="var(--font-mono)"
        fontSize="11"
        letterSpacing="0.08em"
        fill={leader ? 'var(--color-ink)' : 'var(--color-ink-faint)'}
      >
        {label.toUpperCase()}
      </text>
    </motion.g>
  );
}
