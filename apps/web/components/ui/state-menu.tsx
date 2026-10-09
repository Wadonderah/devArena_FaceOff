'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { Tone } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export interface StateOption<T extends string> {
  value: T;
  label: string;
  /// What choosing this actually does. The whole reason this control exists:
  /// a native <select> can show five words and no consequence.
  hint: string;
  tone: Tone;
}

/// Matches the badge tones, as a filled dot rather than a pill.
const DOT: Record<Tone, string> = {
  neutral: 'bg-ink-faint',
  live: 'bg-live',
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
  brand: 'bg-brand-bright',
};

/// A state picker that says what each state means.
///
/// Replaces a bare `SelectField` with `label=""` on the most consequential
/// switch in the console. Three things were wrong with that, and only the third
/// was cosmetic:
///
///   - It had no label at all, so a screen reader announced an unnamed combo
///     box among five others on the page.
///   - It named the states and nothing else. "Completed" does not tell an
///     organizer that it closes the competition, and "Registration open" does
///     not tell them it notifies every account on the platform. Both are
///     findable only by doing it.
///   - A native select renders as the operating system's widget, which is why
///     it looked pasted in next to everything else here.
///
/// Implemented as a listbox rather than a `<select>` because the hint lines are
/// the point and option elements cannot carry them.
export function StateMenu<T extends string>({
  value,
  options,
  onChange,
  label,
  pending = false,
  disabled = false,
  className,
}: {
  value: T;
  options: StateOption<T>[];
  onChange: (next: T) => void;
  /// Named, not decorative — this is the accessible name of the control.
  label: string;
  pending?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];

  // Opening lands on the current value rather than the top of the list, so
  // arrowing moves relative to where you are.
  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function commit(index: number) {
    const option = options[index];
    setOpen(false);
    // Re-selecting the current state is a no-op, not a request to PATCH the
    // competition back to where it already is.
    if (option && option.value !== value) onChange(option.value);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(activeIndex);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <span id={`${baseId}-label`} className="sr-only">
        {label}
      </span>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${baseId}-label`}
        // Complete alternatives, not a base plus an override: `cn` does not
        // merge Tailwind classes, so `border-line` and `border-line-bright`
        // would both survive and CSS source order would decide.
        className={cn(
          'inline-flex h-10 w-full items-center gap-2 rounded-control border px-3 text-left text-sm transition-colors',
          'hover:border-line-bright hover:bg-surface-3/70',
          'disabled:cursor-not-allowed disabled:opacity-60',
          open ? 'border-line-bright bg-surface-3/70' : 'border-line bg-surface-2',
        )}
      >
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[selected.tone])} />
        <span className="flex-1 truncate text-ink">{selected.label}</span>
        <ChevronDown
          aria-hidden
          size={15}
          strokeWidth={1.5}
          className={cn(
            'shrink-0 text-ink-faint transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${baseId}-label`}
          aria-activedescendant={`${baseId}-option-${activeIndex}`}
          onKeyDown={onKeyDown}
          className="absolute right-0 z-50 mt-1.5 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface-1 p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] focus:outline-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;

            return (
              <div
                key={option.value}
                id={`${baseId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={cn(
                  'flex cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                  isActive && 'bg-surface-2',
                )}
              >
                <span
                  aria-hidden
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[option.tone])}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-[13px]',
                        isSelected ? 'font-medium text-ink' : 'text-ink-dim',
                      )}
                    >
                      {option.label}
                    </span>
                    {isSelected && (
                      <Check
                        aria-hidden
                        size={12}
                        strokeWidth={2}
                        className="shrink-0 text-brand-bright"
                      />
                    )}
                  </span>
                  {/* The consequence, which is the thing a native select cannot
                      say and the thing an organizer needs before pressing. */}
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-faint">
                    {option.hint}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
