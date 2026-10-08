'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { CircleCheck } from 'lucide-react';
import { api, describeError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { canSubmitPasswords, shouldShowMismatch } from '@/lib/password-match';
import { PasswordField } from '@/components/ui/password-field';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthBackdrop } from '@/components/auth-backdrop';
import { BrandMark } from '@/components/brand-mark';

function ResetForm() {
  const token = useSearchParams().get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const showMismatch = shouldShowMismatch(password, confirm);
  const submittable = canSubmitPasswords(password, confirm);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    setPending(true);

    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(describeError(err, 'Could not reset your password').detail);
    } finally {
      setPending(false);
    }
  }

  // A link with no token cannot be completed, so say so immediately rather than
  // letting someone type a new password and only then fail.
  if (!token) {
    return (
      <div className="panel hairline p-7 text-center">
        <h1 className="text-2xl">Link not valid</h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">
          This reset link is missing its token. Request a new one and use the most recent email.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="panel hairline p-7 text-center">
        <div
          aria-hidden
          className="mx-auto grid size-11 place-items-center rounded-full bg-success/15 text-success"
        >
          <CircleCheck size={20} strokeWidth={1.5} />
        </div>
        <h1 className="mt-4 text-2xl">Password changed</h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">
          Any other sessions have been signed out. Use your new password from here.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="mb-6 text-center text-3xl">Choose a new password</h1>

      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="At least 10 characters, including a letter and a number."
      />

      <PasswordField
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={showMismatch ? 'Passwords do not match' : undefined}
      />

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        loading={pending}
        disabled={!submittable}
        className="w-full"
      >
        Set new password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main
      id="main"
      className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden px-5 py-16"
    >
      <AuthBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" aria-label="Face-Off home">
            <BrandMark size={48} showWordmark={false} priority />
          </Link>
        </div>

        <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
