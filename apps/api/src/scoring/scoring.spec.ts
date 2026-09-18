import {
  finalScore,
  gradeCoding,
  gradeMcq,
  normalizeRound,
  weightedContribution,
} from './scoring';

describe('gradeMcq', () => {
  it('awards the full points for a correct answer', () => {
    expect(gradeMcq(true, 10)).toBe(10);
  });

  it('awards nothing for a wrong answer, with no negative marking', () => {
    expect(gradeMcq(false, 10)).toBe(0);
  });
});

describe('gradeMcq with negative marking', () => {
  it('still awards full points for a correct answer', () => {
    expect(gradeMcq(true, 10, 3)).toBe(10);
  });

  it('deducts the penalty for a wrong answer', () => {
    expect(gradeMcq(false, 10, 3)).toBe(-3);
  });

  it('never deducts more than the question was worth', () => {
    // Otherwise one wrong guess could cost more than three correct answers earn.
    expect(gradeMcq(false, 10, 25)).toBe(-10);
  });

  it('treats a negative penalty value as its magnitude', () => {
    // An organizer typing -3 means "penalise 3", not "award 3".
    expect(gradeMcq(false, 10, -3)).toBe(-3);
  });

  it('is unchanged when no penalty is configured', () => {
    expect(gradeMcq(false, 10)).toBe(0);
    expect(gradeMcq(false, 10, 0)).toBe(0);
  });

  it('returns positive zero, never negative zero', () => {
    // -0 survives into JSON and the database and reads as a bug to anyone
    // looking at a score row.
    expect(Object.is(gradeMcq(false, 10, 0), 0)).toBe(true);
  });
});

describe('normalizeRound with penalties', () => {
  it('floors a negative round total at zero', () => {
    // A participant who guessed badly should score nothing for the round, not
    // drag down what they earned in other rounds.
    expect(normalizeRound(-15, 50)).toBe(0);
  });

  it('still caps at one', () => {
    expect(normalizeRound(60, 50)).toBe(1);
  });
});

describe('gradeCoding', () => {
  it('awards full points when every test passes', () => {
    expect(gradeCoding(4, 4, 20)).toBe(20);
  });

  it('awards nothing when no test passes', () => {
    expect(gradeCoding(0, 4, 20)).toBe(0);
  });

  it('awards proportional credit for a partial pass', () => {
    expect(gradeCoding(3, 4, 20)).toBe(15);
  });

  it('respects per-test weighting', () => {
    // One heavy test worth 3 and one worth 1; passing only the heavy one.
    expect(gradeCoding(3, 4, 20)).toBe(15);
  });

  it('returns zero rather than dividing by zero when a challenge has no tests', () => {
    expect(gradeCoding(0, 0, 20)).toBe(0);
  });

  it('clamps impossible inputs instead of exceeding the maximum', () => {
    expect(gradeCoding(9, 4, 20)).toBe(20);
    expect(gradeCoding(-1, 4, 20)).toBe(0);
  });
});

describe('weightedContribution', () => {
  it('scales a challenge score by its share of the round', () => {
    // 10 points earned out of a 50-point round carrying 40% weight.
    expect(weightedContribution(10, 50, 0.4)).toBeCloseTo(0.08, 6);
  });

  it('is additive across a round', () => {
    const roundMax = 50;
    const weight = 0.4;
    const perChallenge = [10, 20, 5].map((raw) =>
      weightedContribution(raw, roundMax, weight),
    );
    const summed = perChallenge.reduce((a, b) => a + b, 0);

    // Equals (35/50) * 0.4 — the property the leaderboard aggregate relies on.
    expect(summed).toBeCloseTo((35 / 50) * 0.4, 6);
  });

  it('returns zero for an empty round rather than NaN', () => {
    expect(weightedContribution(10, 0, 0.4)).toBe(0);
  });
});

describe('normalizeRound', () => {
  it('expresses a round score as a fraction', () => {
    expect(normalizeRound(35, 50)).toBeCloseTo(0.7, 6);
  });

  it('caps at 1 even if raw somehow exceeds the maximum', () => {
    expect(normalizeRound(60, 50)).toBe(1);
  });

  it('returns zero for a round with nothing to score', () => {
    expect(normalizeRound(0, 0)).toBe(0);
  });
});

describe('finalScore', () => {
  it('combines rounds by their configured weights', () => {
    const score = finalScore([
      { roundId: 'r1', rawScore: 40, maxRawScore: 50, weight: 0.4 },
      { roundId: 'r2', rawScore: 30, maxRawScore: 60, weight: 0.6 },
    ]);
    // 0.8*0.4 + 0.5*0.6 = 0.32 + 0.30
    expect(score).toBeCloseTo(0.62, 6);
  });

  it('gives a perfect competition a score equal to the total weight', () => {
    const score = finalScore([
      { roundId: 'r1', rawScore: 50, maxRawScore: 50, weight: 0.4 },
      { roundId: 'r2', rawScore: 60, maxRawScore: 60, weight: 0.6 },
    ]);
    expect(score).toBeCloseTo(1, 6);
  });

  it('scores an empty competition as zero', () => {
    expect(finalScore([])).toBe(0);
  });

  it('ignores a round the participant did not attempt', () => {
    const score = finalScore([
      { roundId: 'r1', rawScore: 50, maxRawScore: 50, weight: 0.4 },
      { roundId: 'r2', rawScore: 0, maxRawScore: 60, weight: 0.6 },
    ]);
    expect(score).toBeCloseTo(0.4, 6);
  });
});
