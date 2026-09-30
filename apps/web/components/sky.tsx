'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

const W = 1440;
const H = 900;

// The horizon. Everything above it is sky, everything below is the arena floor,
// and the floor's lines converge on a point above it — the way a real one does.
const HORIZON = 470;
const VANISH_X = W / 2;

/// The landing page's backdrop: one scene, not a texture.
///
/// The previous version scattered dust over graph paper, which read as two
/// unrelated patterns competing for the same space. This is a single idea — a
/// floor receding to a horizon, with the stadium standing on it — so the arena
/// and its surroundings belong to one place instead of being a picture pinned
/// to a wall.
///
/// Fixed to the viewport so it stays put while the content scrolls past.
export function Sky() {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 2000], [0, 160]);

  return (
    <div className="sky" aria-hidden>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          {/* The floor fades out before the bottom edge, so the grid never
              reads as a hard-edged texture swatch. */}
          <linearGradient id="floor-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0" />
            <stop offset="0.22" stopColor="white" stopOpacity="0.85" />
            <stop offset="0.75" stopColor="white" stopOpacity="0.5" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="floor-mask">
            <rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill="url(#floor-fade)" />
          </mask>

          {/* Halftone dissolve: dense at the top edge, gone by the horizon. */}
          <linearGradient id="halftone-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.9" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="halftone-mask">
            <rect x="0" y="0" width={W} height={HORIZON} fill="url(#halftone-fade)" />
          </mask>

          {/* A glow sitting on the horizon, where the stadium stands. */}
          <radialGradient id="horizon-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--color-brand)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <motion.g style={reduceMotion ? undefined : { y }}>
          {/* ── Sky: a square halftone, fading downward ────────────────── */}
          <g mask="url(#halftone-mask)" fill="var(--arena-dust)">
            {HALFTONE.map((d, i) => (
              <rect key={i} x={d.x} y={d.y} width={d.s} height={d.s} opacity={d.o} />
            ))}
          </g>

          {/* ── Floor: lines converging on a vanishing point ───────────── */}
          <g mask="url(#floor-mask)" stroke="var(--arena-ring)" fill="none">
            {/* Radials, spread well past the edges so the outermost still cross
                the viewport at wide aspect ratios. */}
            {Array.from({ length: 23 }, (_, i) => {
              const x = -W * 0.9 + (i * (W * 2.8)) / 22;
              return (
                <line
                  key={`r${i}`}
                  x1={VANISH_X}
                  y1={HORIZON}
                  x2={x}
                  y2={H}
                  strokeWidth={0.6}
                  strokeOpacity={0.5}
                />
              );
            })}

            {/* Transverse lines crowding toward the horizon — that spacing is
                what sells depth; even spacing just reads as a flat grid. */}
            {Array.from({ length: 14 }, (_, i) => {
              const t = (i + 1) / 14;
              const yy = HORIZON + (H - HORIZON) * t * t;
              return (
                <line
                  key={`t${i}`}
                  x1={0}
                  y1={yy}
                  x2={W}
                  y2={yy}
                  strokeWidth={0.6}
                  strokeOpacity={0.4}
                />
              );
            })}
          </g>

          <ellipse cx={VANISH_X} cy={HORIZON} rx={620} ry={210} fill="url(#horizon-glow)" />
        </motion.g>
      </svg>
    </div>
  );
}

interface Dot {
  x: number;
  y: number;
  s: number;
  o: number;
}

/// A square dot grid that thins out as it descends.
///
/// Deterministic — the same field on server and client. A random one would
/// shift on hydration and read as a flicker.
function halftone(): Dot[] {
  const dots: Dot[] = [];
  const step = 22;
  let seed = 20260930;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let y = 0; y < HORIZON; y += step) {
    for (let x = 0; x < W; x += step) {
      // A dot's chance of existing falls off with depth, so the grid dissolves
      // rather than stopping at a line.
      const depth = 1 - y / HORIZON;
      if (rand() > depth * 0.85) continue;
      dots.push({
        x: x + (rand() - 0.5) * 3,
        y: y + (rand() - 0.5) * 3,
        s: 1.5 + rand() * 1.2,
        o: 0.18 + depth * 0.5,
      });
    }
  }
  return dots;
}

const HALFTONE = halftone();
