import { parseStoredTheme, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('returns an explicit choice unchanged', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('follows the operating system when set to system', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });

  // The reason "System" was reported as not working: when the OS already
  // matches the current theme, choosing it changes no colours at all. The
  // function is right; the control had to show that the press registered.
  it('resolves to the same value the user is already looking at, when they match', () => {
    expect(resolveTheme('system', false)).toBe(resolveTheme('dark', false));
    expect(resolveTheme('system', true)).toBe(resolveTheme('light', true));
  });
});

describe('parseStoredTheme', () => {
  it('accepts the three valid values', () => {
    expect(parseStoredTheme('light')).toBe('light');
    expect(parseStoredTheme('dark')).toBe('dark');
    expect(parseStoredTheme('system')).toBe('system');
  });

  // Storage is shared with every script on the origin and survives deploys, so
  // a stale or hand-written value must not reach `data-theme`.
  it.each([null, '', 'Dark', 'auto', 'midnight', '{}'])('falls back for %p', (raw) => {
    expect(parseStoredTheme(raw)).toBe('system');
  });
});
