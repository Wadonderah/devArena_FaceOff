'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

// `children` is omitted deliberately. InputHTMLAttributes includes it, so
// passing children here type-checks and then fails at runtime with "input is a
// self-closing tag and must neither have `children` nor use
// dangerouslySetInnerHTML" — which took down the whole login page once. Use
// `trailing` for anything that needs to sit inside the field.
interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  label: string;
  hint?: string;
  error?: string;
  /// Rendered inside the input, against its trailing edge — a show/hide toggle,
  /// a unit, a clear button. Must stay narrow: the input reserves a fixed
  /// amount of room for it rather than measuring, so a wide adornment would sit
  /// over the text instead of beside it.
  trailing?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, trailing, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-[13px] font-medium text-ink-dim">
        {label}
      </label>

      {/* `relative` only when there is something to position, so a plain field
          keeps exactly the layout it had. */}
      <div className={trailing ? 'relative' : undefined}>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full h-11 px-3.5 rounded-lg bg-surface-1 text-ink placeholder:text-ink-faint',
            'border transition-colors duration-150',
            error ? 'border-danger/70' : 'border-line hover:border-line-bright',
            'focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-brand-bright',
            // Room for the adornment, so long values scroll behind it rather
            // than underneath it.
            trailing ? 'pr-11' : undefined,
            className,
          )}
          {...rest}
        />

        {trailing && (
          <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>
        )}
      </div>

      {error ? (
        // role="alert" so the message is announced the moment it appears.
        <p id={`${inputId}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[13px] text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
