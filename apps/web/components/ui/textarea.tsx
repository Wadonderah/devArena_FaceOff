'use client';

import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
  mono?: boolean;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ label, hint, error, mono, className, id, ...rest }, ref) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

    return (
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="block text-[13px] font-medium text-ink-dim">
          {label}
        </label>

        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full min-h-24 px-3.5 py-2.5 rounded-[10px] bg-surface-1 text-ink',
            'placeholder:text-ink-faint border transition-colors duration-150 resize-y',
            mono && 'font-mono text-[13px]',
            error ? 'border-danger/70' : 'border-line hover:border-line-bright',
            'focus:border-brand focus:outline-none',
            className,
          )}
          {...rest}
        />

        {error ? (
          <p id={`${fieldId}-error`} role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={`${fieldId}-hint`} className="text-[13px] text-ink-faint">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
