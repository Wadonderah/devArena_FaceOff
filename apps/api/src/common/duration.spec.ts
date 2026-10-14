import { parseDuration } from './duration';

describe('parseDuration', () => {
  it('parses each supported unit', () => {
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(parseDuration('7d')).toBe(604_800_000);
  });

  // jsonwebtoken's own rule, so one config value can feed both the signer and
  // the cookie without translation.
  it('treats a bare number as seconds', () => {
    expect(parseDuration('900')).toBe(900_000);
  });

  // `ms` must be matched before the single letters, or this reads as 500 minutes.
  it('does not mistake milliseconds for minutes', () => {
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('500m')).toBe(30_000_000);
  });

  it('is tolerant of case and surrounding space', () => {
    expect(parseDuration(' 15M ')).toBe(900_000);
    expect(parseDuration('2H')).toBe(7_200_000);
  });

  it('accepts a fractional value', () => {
    expect(parseDuration('1.5h')).toBe(5_400_000);
  });

  // Throwing at boot is the point: a silently-zero cookie lifetime would log
  // every user out on the next request.
  it.each(['', 'soon', '15 minutes', 'm15', '15x', '-5m'])(
    'rejects %p rather than defaulting',
    (bad) => {
      expect(() => parseDuration(bad)).toThrow(/Invalid duration/);
    },
  );

  it('names the offending value so a bad .env is findable', () => {
    expect(() => parseDuration('fifteen')).toThrow(/"fifteen"/);
  });
});
