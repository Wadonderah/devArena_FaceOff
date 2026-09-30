'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { AuthBackdrop } from '@/components/auth-backdrop';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'Something went wrong');
      setPending(false);
    }
  }

  return (
    <main id="main" className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden px-5 py-16">
      <AuthBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col">
      <Link href="/" className="mb-8 inline-flex items-center gap-2.5 self-start">
        <span
          aria-hidden
          className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-[13px] font-bold text-white"
        >
          F
        </span>
        <span className="font-display text-[15px] font-semibold">Face-Off</span>
      </Link>

      <h1 className="text-3xl">Sign in</h1>
      <p className="mt-2 text-[15px] text-ink-dim">Welcome back. Let&apos;s get you competing.</p>

            {/*
        method="post" matters even though onSubmit handles the request. A form
        with no method defaults to GET, so if hydration ever fails this form
        becomes inert HTML and the browser submits the password in the query
        string — into history, access logs and Referer headers. With POST the
        worst case puts it in a request body instead.
      */}
      <form method="post" onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={pending} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-[14px] text-ink-faint">
        No account yet?{' '}
        <Link href="/register" className="text-brand-bright underline underline-offset-4">
          Create one
        </Link>
      </p>
      </div>
    </main>
  );
}
