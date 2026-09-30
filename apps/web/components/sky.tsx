'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { dustField } from '@/lib/dust';

const W = 1440;
const H = 900;

// Sparser than the arena's field: this sits behind text, and dust that
// competes with a paragraph is noise, not atmosphere.
const DUST = dustField(150, 20260920, W, H);

/// The landing page's sky — the arena's, continued across the whole page.
///
/// The signed-in app sits on graph paper, which is right for a place where
/// you work. The home page is a place where you arrive; it gets the same deep
/// sky the arena is drawn in, so the illustration and its surroundings read as
/// one space rather than a picture pinned to a wall.
///
/// Fixed to the viewport so it stays put while the page scrolls past, the way
/// a sky does. Rendered once, server-side, with a seeded field.
export function Sky() {
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  // The field drifts at roughly a third of scroll speed. The container is
  // already `position: fixed`, so this is a transform on a composited layer —
  // no layout, no repaint of anything behind it.
  const y = useTransform(scrollY, [0, 2000], [0, 260]);

  return (
    <div className="sky" aria-hidden>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <motion.g fill="var(--arena-dust)" style={reduceMotion ? undefined : { y }}>
          {DUST.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r * 0.75} opacity={d.o * 0.85} />
          ))}
        </motion.g>
      </svg>
    </div>
  );
}
