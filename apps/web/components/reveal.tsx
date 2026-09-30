'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/// Settles a section into place as it enters the viewport.
///
/// `once: true` because a section that re-animates every time it scrolls past
/// stops reading as arrival and starts reading as a glitch. The negative margin
/// starts the motion slightly before the element is fully in view, so it has
/// finished by the time it is being read rather than moving under the eye.
///
/// With reduced motion the children are returned unwrapped — not merely with a
/// zero duration — so there is no transform or opacity state at all. Same rule
/// arena.tsx and use-mock-standings.ts follow.
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
