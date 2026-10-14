import { safeReturnTo } from './safe-return-to';

describe('safeReturnTo', () => {
  it('keeps an in-app path', () => {
    expect(safeReturnTo('/rounds/r1/coding')).toBe('/rounds/r1/coding');
    expect(safeReturnTo('/teams/t1?tab=members')).toBe('/teams/t1?tab=members');
  });

  it('falls back when there is nothing to return to', () => {
    expect(safeReturnTo(null)).toBe('/dashboard');
    expect(safeReturnTo('')).toBe('/dashboard');
  });

  // Without this, /login?returnTo=https://evil.example turns our own sign-in
  // page into a phishing redirect that looks entirely genuine, because the
  // address bar shows our domain right up until the bounce.
  it.each([
    'https://evil.example',
    'http://evil.example/x',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'evil.example',
  ])('refuses to leave the origin for %p', (hostile) => {
    expect(safeReturnTo(hostile)).toBe('/dashboard');
  });

  it('honours a caller-supplied fallback', () => {
    expect(safeReturnTo(null, '/competitions')).toBe('/competitions');
  });
});
