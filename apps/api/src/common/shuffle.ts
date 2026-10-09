import { createHash } from 'node:crypto';

/// Deterministic per-participant shuffle. The order must be stable for a given
/// seed, or a participant who refreshes mid-question sees the options jump.
///
/// Presentation only — grading resolves the correct option by id.
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  const random = mulberry32(hashToInt(seed));

  // Fisher-Yates, walking backwards so every permutation is equally likely.
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function hashToInt(seed: string): number {
  // First 4 bytes of SHA-256 as a uint32. Not needed for fairness, but it
  // distributes better than a hand-rolled string hash.
  return createHash('sha256').update(seed).digest().readUInt32BE(0);
}

/// Deterministic 32-bit PRNG. Math.random() cannot be used here.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

/// Reassigns A-D by position. Without it the shuffle is cosmetic — each option
/// keeps its authored label, so a shared letter still gives the answer away.
export function relabel<T extends { label: string }>(options: T[]): T[] {
  return options.map((option, index) => ({
    ...option,
    label: LABELS[index] ?? option.label,
  }));
}
