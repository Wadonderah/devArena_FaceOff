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
/// Typing a password you cannot see, on a phone keyboard, under time pressure,
/// is where sign-in failures come from — and the usual response, trying again
/// more slowly, is exactly what the login rate limit punishes.
///
/// The toggle is a real `<button>`, not an icon with an onClick: it must be
/// reachable by keyboard, and a screen reader has to be able to say what it
/// does and what state it is in. `aria-pressed` carries the state, so the
/// accessible name stays constant rather than flipping between "Show" and
/// "Hide" underneath the user.
///
/// `type` is switched rather than the text being masked some other way, so
/// password managers still recognise the field. That is also why `autoComplete`
/// is left to the caller — `current-password` on sign in and `new-password` on
/// sign up mean different things to a manager, and guessing here would break
/// both.
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
            // -1 would take it out of the tab order; the whole point is that it
            // is reachable without a mouse.
            className="grid size-9 place-items-center rounded-md text-ink-faint transition-colors hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-brand-bright"
          >
            <Icon aria-hidden size={16} strokeWidth={1.5} />
          </button>
        }
      />
    );
  },
);
