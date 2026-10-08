'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { parseStoredTheme, resolveTheme, type Theme } from '@/lib/theme';
import { cn } from '@/lib/cn';

export type { Theme };

const STORAGE_KEY = 'faceoff-theme';

/// Mirrors the inline script in layout.tsx. Both must agree, or the first paint
/// disagrees with the first render.
function resolve(theme: Theme): 'light' | 'dark' {
  return resolveTheme(theme, window.matchMedia('(prefers-color-scheme: light)').matches);
}

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = resolve(theme);
}

/// Lucide rather than the characters ☀ ◐ ☾.
///
/// The glyphs rendered at whatever weight the surrounding font happened to
/// supply, so the three never quite matched each other or the icons used
/// everywhere else — the same reason the toasts stopped using ✓ ✕ i.
const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);
  // What `system` currently resolves to. Tracked so the control can say so:
  // see the comment on the live region below.
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const stored = parseStoredTheme(localStorage.getItem(STORAGE_KEY));
    setTheme(stored);
    setResolved(resolve(stored));
    setMounted(true);
  }, []);

  // Following the OS only means anything if it keeps following it — someone
  // whose machine flips at sunset expects the page to flip with it.
  useEffect(() => {
    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      apply('system');
      setResolved(resolve('system'));
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    setResolved(resolve(next));
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn('inline-flex rounded-lg border border-line bg-surface-1 p-0.5', className)}
    >
      {OPTIONS.map((option) => {
        // Before hydration the stored choice is unknown, so nothing is marked
        // selected — guessing here produces a visible flicker on load.
        const active = mounted && theme === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            aria-pressed={active}
            // Names what System will actually do, which the icon cannot.
            title={
              option.value === 'system'
                ? `Follow the system theme (currently ${resolved})`
                : `${option.label} theme`
            }
            className={cn(
              'grid size-7 place-items-center rounded-md border transition-colors duration-150',
              active
                ? // A border as well as a background. Pressing System when the
                  // system already matches the current theme changes no colours
                  // at all, so the only feedback that the press registered is
                  // this state — it has to be unmistakable, or the button reads
                  // as broken while working perfectly. That is exactly how it
                  // was reported.
                  'border-brand/60 bg-surface-3 text-ink'
                : 'border-transparent text-ink-faint hover:text-ink-dim',
            )}
          >
            <Icon aria-hidden size={14} strokeWidth={1.6} />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}

      {/* Announced for the same reason the border exists: when the resolved
          theme does not change, a screen reader would otherwise get no signal
          that anything happened. */}
      <span aria-live="polite" className="sr-only">
        {mounted
          ? theme === 'system'
            ? `Following the system theme, currently ${resolved}`
            : `${theme} theme`
          : ''}
      </span>
    </div>
  );
}
