'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

type State = { kind: 'pending' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

function VerifyEmailInner() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>({ kind: 'pending' });

  // React 18 StrictMode mounts effects twice in development; the token is
  // single-use, so a second call would report a valid link as already spent.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState({ kind: 'error', message: 'This link is missing its verification token.' });
      return;
    }

    api<{ message: string }>('/auth/verify-email', { method: 'POST', body: { token } })
      .then((res) => setState({ kind: 'ok', message: res.message }))
      .catch((err) =>
        setState({
          kind: 'error',
          message: err instanceof ApiError ? err.displayMessage : 'Verification failed.',
        }),
      );
  }, [token]);

  return (
    <div className="panel hairline p-7 text-center">
      {state.kind === 'pending' && (
        <>
          <Skeleton className="mx-auto size-11 rounded-full" />
          <h1 className="mt-4 text-2xl">Verifying…</h1>
        </>
      )}

      {state.kind === 'ok' && (
        <>
          <div aria-hidden className="mx-auto grid size-11 place-items-center rounded-full bg-success/15 text-success">
            ✓
          </div>
          <h1 className="mt-4 text-2xl">Email verified</h1>
          <p className="mt-2.5 text-[15px] text-ink-dim">{state.message}</p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white"
          >
            Sign in
          </Link>
        </>
      )}

      {state.kind === 'error' && (
        <>
          <div aria-hidden className="mx-auto grid size-11 place-items-center rounded-full bg-danger/15 text-danger">
            !
          </div>
          <h1 className="mt-4 text-2xl">Link not valid</h1>
          <p role="alert" className="mt-2.5 text-[15px] text-ink-dim">
            {state.message}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-10 items-center rounded-lg border border-line bg-surface-3 px-4 text-sm"
          >
            Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <Suspense fallback={<Skeleton className="h-52 w-full rounded-xl" />}>
        <VerifyEmailInner />
      </Suspense>
    </main>
  );
}
