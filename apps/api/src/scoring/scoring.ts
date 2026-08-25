/// Pure scoring functions. No database, no request context — the competition's
/// arithmetic lives here alone so it can be reasoned about and tested directly.

export interface RoundContribution {
  roundId: string;
  rawScore: number;
  maxRawScore: number;
  weight: number;
}

export function gradeMcq(isCorrect: boolean, points: number): number {
  return isCorrect ? points : 0;
}

/// Coding challenges award partial credit by weighted test cases. A solution
/// passing three of four equally weighted tests earns 75% of the points, which
/// is fairer for a learning-focused pilot than all-or-nothing.
export function gradeCoding(
  passedWeight: number,
  totalWeight: number,
  points: number,
): number {
  if (totalWeight <= 0) return 0;
  const ratio = Math.min(Math.max(passedWeight / totalWeight, 0), 1);
  return round4(ratio * points);
}

/// A single challenge's contribution to the final score.
///
/// Dividing by the round's total available points rather than the challenge's own
/// makes these values additive: summing every event in a round yields exactly
/// (roundRaw / roundMax) x weight, and summing across rounds yields the final
/// score. Without that, per-challenge weighted values would overcount.
export function weightedContribution(
  rawScore: number,
  roundMaxPoints: number,
  roundWeight: number,
): number {
  if (roundMaxPoints <= 0) return 0;
  return round6((rawScore / roundMaxPoints) * roundWeight);
}

export function normalizeRound(rawScore: number, maxRawScore: number): number {
  if (maxRawScore <= 0) return 0;
  return round6(Math.min(rawScore / maxRawScore, 1));
}

export function finalScore(contributions: RoundContribution[]): number {
  const total = contributions.reduce(
    (sum, c) => sum + normalizeRound(c.rawScore, c.maxRawScore) * c.weight,
    0,
  );
  return round6(total);
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;
