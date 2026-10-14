'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { api, describeError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { AuthBackdrop } from '@/components/auth-backdrop';
import { BrandMark } from '@/components/brand-mark';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(describeError(err, 'Could not send the email').detail);
    } finally {
      setPending(false);
    }
  }

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

          <h1 className="mt-5 text-3xl">{sent ? 'Check your inbox' : 'Reset your password'}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">
            {sent
              ? 'If that address has an account, a reset link is on its way. It expires in 1 hour.'
              : 'Enter the address you signed up with and we will send you a link.'}
          </p>
        </div>

        {sent ? (
          <div className="panel hairline p-7 text-center">
            <div
              aria-hidden
              className="mx-auto grid size-11 place-items-center rounded-full bg-success/15 text-success"
            >
              <MailCheck size={20} strokeWidth={1.5} />
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-dim">
              Nothing arrived after a few minutes? Check your spam folder, then try again.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-10 items-center rounded-lg border border-line bg-surface-3 px-4 text-sm"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger"
              >
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={pending} className="w-full">
              Send reset link
            </Button>

            <p className="text-center text-[14px] text-ink-faint">
              <Link href="/login" className="underline underline-offset-4">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
