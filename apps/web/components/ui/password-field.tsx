'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Field } from '@/components/ui/input';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: string;
  error?: string;
}

/// A password input with a show/hide toggle.
///
/// `aria-pressed` carries the state so the accessible name stays constant
/// rather than flipping under the user. `type` is switched rather than masking
// /// the text another way, so password managers still recognise the field —
/// `autoComplete` is left to the caller for the same reason, since
/// `current-password` and `new-password` mean different things to a manager.
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, hint, error, ...rest }, ref) {
    const [visible, setVisible] = useState(false);

    const Icon = visible ? EyeOff : Eye;

    return (
      <Field
        ref={ref}
        label={label}
        hint={hint}
        error={error}
        type={visible ? 'text' : 'password'}
        {...rest}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label="Show password"
            // -1 would take it out of the tab order.
            className="grid size-9 place-items-center rounded-md text-ink-faint transition-colors hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-brand-bright"
          >
            <Icon aria-hidden size={16} strokeWidth={1.5} />
          </button>
        }
      />
    );
  },
);
