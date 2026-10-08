/// How a final score is shown to a participant.
///
/// Scores are a fraction of the whole competition: every round contributes
/// `(roundRaw / roundMax) × weight`, and weights sum to at most 1.0, so the
/// total lives in [0, 1]. It was being rendered as `toFixed(4)` — "0.4000" —
/// which is the raw internal value and tells a reader nothing. A percentage
/// says the thing the number actually means: how much of the competition you
/// have earned.
///
/// One decimal place, because two is false precision on a figure that moves in
/// steps of a whole challenge, and none would show three different teams all on
/// "40%".
export function formatScore(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  // A whole number reads better than "40.0%", but a fractional one needs the
  // decimal to stay distinguishable from its neighbours.
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

const SUFFIX: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };

/// 1 → "1st", 2 → "2nd", 11 → "11th".
export function ordinal(n: number): string {
  // 11, 12 and 13 are the exceptions that a naive last-digit rule gets wrong.
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${SUFFIX[n % 10] ?? 'th'}`;
}

/// "2nd of 7" — a position is meaningless without the size of the field.
export function placing(rank: number, total: number): string {
  if (!total) return ordinal(rank);
  return `${ordinal(rank)} of ${total}`;
}
