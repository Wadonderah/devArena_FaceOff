export type Theme = 'light' | 'dark' | 'system';

/// What a stored theme preference actually resolves to.
///
/// Extracted so it can be tested, and so the one rule lives in one place. The
/// inline script in layout.tsx duplicates this logic deliberately — it has to
/// run before React exists — and the two must agree or the first paint
/// disagrees with the first render.
export function resolveTheme(theme: Theme, prefersLight: boolean): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return prefersLight ? 'light' : 'dark';
}

/// Only these three are honoured; anything else in localStorage falls back.
///
/// Storage is shared with every other script on the origin and survives across
/// deploys, so a value written by an older build — or by hand — must not put
/// `data-theme` into a state the stylesheet has no rules for.
export function parseStoredTheme(raw: string | null): Theme {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}
