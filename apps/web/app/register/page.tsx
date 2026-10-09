'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { canSubmitPasswords, shouldShowMismatch } from '@/lib/password-match';
import { PasswordField } from '@/components/ui/password-field';
import { AuthBackdrop } from '@/components/auth-backdrop';
import { BrandMark } from '@/components/brand-mark';
import { MailCheck } from 'lucide-react';
import {
  AuthDivider,
  GoogleSignInButton,
  useAuthProviders,
} from '@/components/google-sign-in-button';

export default function RegisterPage() {
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const { data: providers } = useAuthProviders();

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const showMismatch = shouldShowMismatch(form.password, confirm);
  const submittable = canSubmitPasswords(form.password, confirm);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    // Belt and braces with the disabled button: a form can still be submitted
    // by pressing Enter in a field, and the API has no confirm field to
    // validate against.
    if (form.password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    setPending(true);

    try {
      await api('/auth/register', { method: 'POST', body: form });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <main id="main" className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden px-5">
        <AuthBackdrop />
        <div className="panel hairline relative z-10 mx-auto w-full max-w-md p-7 text-center">
          <div aria-hidden className="mx-auto grid size-11 place-items-center rounded-full bg-success/15 text-success">
            <MailCheck size={20} strokeWidth={1.5} />
          </div>
          <h1 className="mt-4 text-2xl">Check your inbox</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">
            We sent a verification link to <strong className="text-ink">{form.email}</strong>. It
            expires in 24 hours.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-10 items-center rounded-lg border border-line bg-surface-3 px-4 text-sm"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden px-5 py-16">
      <AuthBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col">
      {/* Register had no brand mark at all, so arriving here from the landing
          page dropped every visual cue that you were still in the same product.
          Laid out exactly as login's header, so the two pages do not subtly
          disagree when someone switches between them. */}
      <div className="mb-8 flex flex-col items-center text-center">
        <Link href="/" aria-label="Face-Off home">
          <BrandMark size={48} showWordmark={false} priority />
        </Link>

        <h1 className="mt-5 text-3xl">Create your account</h1>
        <p className="mt-2 text-[15px] text-ink-dim">
          Verify your email, join the competition, and you&apos;re in.
        </p>
      </div>

            {/*
        method="post" matters even though onSubmit handles the request. A form
        with no method defaults to GET, so if hydration ever fails this form
        becomes inert HTML and the browser submits the password in the query
        string — into history, access logs and Referer headers. With POST the
        worst case puts it in a request body instead.
      */}
      {/* No email verification step and no password to invent, so for most
          people this is the whole of registration. It goes first. */}
      <GoogleSignInButton label="Sign up with Google" />

      {providers?.google && <AuthDivider className="mt-5" />}

      <form method="post" onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <Field
          label="Display name"
          name="displayName"
          autoComplete="name"
          required
          value={form.displayName}
          onChange={set('displayName')}
          hint="This is the name shown on the leaderboard."
        />

        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set('email')}
        />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={set('password')}
          hint="At least 10 characters, including a letter and a number."
        />

        <PasswordField
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          // Only complains once there is enough typed to be a real mismatch,
          // rather than flashing an error at the first keystroke of a password
          // nobody has finished entering.
          error={showMismatch ? 'Passwords do not match' : undefined}
        />

        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
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
          Create account
        </Button>
      </form>

      <p className="mt-6 text-[14px] text-ink-faint">
        Already registered?{' '}
        <Link href="/login" className="text-brand-bright underline underline-offset-4">
          Sign in
        </Link>
      </p>
      </div>
    </main>
  );
}
