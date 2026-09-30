'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { AuthBackdrop } from '@/components/auth-backdrop';
import { MailCheck } from 'lucide-react';

export default function RegisterPage() {
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
            className="mt-6 inline-flex h-10 items-center rounded-[10px] border border-line bg-surface-3 px-4 text-sm"
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
      <h1 className="text-3xl">Create your account</h1>
      <p className="mt-2 text-[15px] text-ink-dim">
        Verify your email, join the competition, and you&apos;re in.
      </p>

            {/*
        method="post" matters even though onSubmit handles the request. A form
        with no method defaults to GET, so if hydration ever fails this form
        becomes inert HTML and the browser submits the password in the query
        string — into history, access logs and Referer headers. With POST the
        worst case puts it in a request body instead.
      */}
      <form method="post" onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
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

        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={set('password')}
          hint="At least 10 characters, including a letter and a number."
        />

        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={pending} className="w-full">
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
