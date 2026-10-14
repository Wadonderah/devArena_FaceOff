import { formatScore, ordinal, placing } from './score-format';

describe('formatScore', () => {
  // The number a participant used to see was `0.4000` — the raw internal
  // fraction, four decimal places of it, meaning nothing to a reader.
  it('shows a fraction of the competition as a percentage', () => {
    expect(formatScore(0.4)).toBe('40%');
    expect(formatScore(1)).toBe('100%');
    expect(formatScore(0)).toBe('0%');
  });

  it('keeps one decimal only when it distinguishes something', () => {
    expect(formatScore(0.405)).toBe('40.5%');
    expect(formatScore(0.4)).toBe('40%');
  });

  // Two decimals would be false precision on a figure that moves in steps of a
  // whole challenge.
  it('does not invent precision', () => {
    expect(formatScore(0.123456)).toBe('12.3%');
  });

  it('does not render NaN at a participant', () => {
    expect(formatScore(Number.NaN)).toBe('—');
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('ordinal', () => {
  it('handles the ordinary cases', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
  });

  // The exceptions a naive last-digit rule gets wrong.
  it('handles the teens', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('handles the twenties and beyond', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(111)).toBe('111th');
    expect(ordinal(101)).toBe('101st');
  });
});

describe('placing', () => {
  // A position is meaningless without the size of the field: 3rd of 4 and 3rd
  // of 400 are different achievements.
  it('names the field size', () => {
    expect(placing(2, 7)).toBe('2nd of 7');
  });

  it('falls back to the bare position when the field is unknown', () => {
    expect(placing(2, 0)).toBe('2nd');
  });
});
