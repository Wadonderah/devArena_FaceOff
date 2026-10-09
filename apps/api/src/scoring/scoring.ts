/// Pure scoring arithmetic. No database, no request context.

export interface RoundContribution {
  roundId: string;
  rawScore: number;
  maxRawScore: number;
  weight: number;
}

/// Grades one MCQ answer. Clamped at zero so a participant is never worse off
/// than not answering; round totals are floored separately in normalizeRound().
export function gradeMcq(isCorrect: boolean, points: number, negativeMarking = 0): number {
  if (isCorrect) return points;

  const penalty = Math.min(Math.abs(negativeMarking), points);

  // Not `-penalty`: negating zero yields -0, which survives into JSON.
  return penalty === 0 ? 0 : -penalty;
}

/// Partial credit by weighted test cases: three of four equal tests earns 75%.
export function gradeCoding(
  passedWeight: number,
  totalWeight: number,
  points: number,
): number {
  if (totalWeight <= 0) return 0;
  const ratio = Math.min(Math.max(passedWeight / totalWeight, 0), 1);
  return round4(ratio * points);
}

/// A challenge's contribution to the final score.
///
/// The denominator is the ROUND's total points, not the challenge's own — that
/// is what makes these additive, so summing events gives exactly
/// (roundRaw / roundMax) x weight. Using the challenge max overcounts.
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
  // Floored as well as capped: negative marking can take a round's raw total
  // below zero, which would subtract from the participant's other rounds.
  return round6(Math.min(Math.max(rawScore / maxRawScore, 0), 1));
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
