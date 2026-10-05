'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'faceoff-theme';

/// Mirrors the inline script in layout.tsx. Both must agree, or the first paint
/// disagrees with the first render.
function resolve(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = resolve(theme);
}

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'system', label: 'System', icon: '◐' },
  { value: 'dark', label: 'Dark', icon: '☾' },
];

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') setTheme(stored);
    setMounted(true);
  }, []);

  // Following the OS only means anything if it keeps following it — someone
  // whose machine flips at sunset expects the page to flip with it.
  useEffect(() => {
    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        'inline-flex rounded-lg border border-line bg-surface-1 p-0.5',
        className,
      )}
    >
      {OPTIONS.map((option) => {
        // Before hydration the stored choice is unknown, so nothing is marked
        // selected — guessing here produces a visible flicker on load.
        const active = mounted && theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            aria-pressed={active}
            title={`${option.label} theme`}
            className={cn(
              'grid size-7 place-items-center rounded-md text-[13px] transition-colors duration-150',
              active
                ? 'bg-surface-3 text-ink'
                : 'text-ink-faint hover:text-ink-dim',
            )}
          >
            <span aria-hidden>{option.icon}</span>
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
