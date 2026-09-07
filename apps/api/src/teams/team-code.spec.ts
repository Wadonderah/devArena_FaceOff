import { generateTeamCode, normalizeTeamCode } from './team-code';

describe('generateTeamCode', () => {
  it('produces a six character code', () => {
    expect(generateTeamCode()).toHaveLength(6);
  });

  it('omits characters that are misread aloud (0/O, 1/I/L)', () => {
    const codes = Array.from({ length: 200 }, generateTeamCode).join('');
    expect(codes).not.toMatch(/[01OIL]/);
  });

  it('uses only uppercase alphanumerics', () => {
    expect(generateTeamCode()).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('does not repeat within a reasonable sample', () => {
    const codes = new Set(Array.from({ length: 500 }, generateTeamCode));
    // 31^6 is ~887 million, so 500 draws should essentially never collide.
    expect(codes.size).toBe(500);
  });
});

describe('normalizeTeamCode', () => {
  it('uppercases what the participant typed', () => {
    expect(normalizeTeamCode('abc123')).toBe('ABC123');
  });

  it('ignores spaces and hyphens', () => {
    expect(normalizeTeamCode('ABC 123')).toBe('ABC123');
    expect(normalizeTeamCode('ABC-123')).toBe('ABC123');
    expect(normalizeTeamCode(' abc-1 23 ')).toBe('ABC123');
  });

  it('leaves an already-clean code untouched', () => {
    expect(normalizeTeamCode('XYZ789')).toBe('XYZ789');
  });
});
