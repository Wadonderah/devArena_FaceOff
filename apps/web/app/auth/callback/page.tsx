'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { safeReturnTo } from '@/lib/safe-return-to';
import { takeReturnTo } from '@/components/google-sign-in-button';
import type { CurrentUser } from '@/lib/types';

/// Why Google's redirect does not land on the dashboard.
///
/// Both auth cookies are SameSite=Strict, and a Strict cookie set on the
/// response to a cross-site navigation is dropped by the browser. Google's
/// redirect back to the API *is* such a navigation, so the callback there
/// cannot sign anyone in — it would appear to work and land the participant on
/// a logged-out dashboard.
///
/// So the API redirects here instead, with a single-use code, and this page
/// exchanges it with a same-site POST. That request carries our own origin, so
/// the cookies it sets are stored normally.
const REASONS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled. Nothing has changed on your account.',
  // Either a forged callback or a tab left open long enough for the state
  // cookie to expire. The second is far more likely, so the wording leads with
  // it rather than accusing anyone.
  state: 'That sign-in attempt expired. Please start again.',
  unavailable: 'Google sign-in is not enabled on this deployment.',
  failed: 'Google sign-in did not complete. Please try again.',
};

function CallbackInner() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const code = params.get('code');
  const errorReason = params.get('error');
  // Read from sessionStorage, which the button wrote before leaving. Not from
  // a query parameter: this page is reached by a redirect we do not fully
  // control the inputs to, and `safeReturnTo` is the second line of defence
  // rather than the only one.
  const [returnTo] = useState(() => safeReturnTo(takeReturnTo()));

  const [message, setMessage] = useState<string | null>(
    errorReason ? (REASONS[errorReason] ?? REASONS.failed) : null,
  );

  // StrictMode mounts effects twice in development, and the code is single-use,
  // so a second call would report a perfectly good sign-in as expired. Same
  // guard the verify-email page needs, for the same reason.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || errorReason) return;
    attempted.current = true;

    if (!code) {
      setMessage(REASONS.failed);
      return;
    }

    api<{ user: CurrentUser }>('/auth/google/exchange', { method: 'POST', body: { code } })
      .then((result) => {
        // Seed the cache rather than letting the dashboard refetch: the session
        // is already known, and a round trip here is a visible blank frame.
        queryClient.setQueryData(['me'], result.user);
        router.replace(returnTo);
      })
      .catch((error) =>
        setMessage(
          error instanceof ApiError ? error.displayMessage : REASONS.failed,
        ),
      );
  }, [code, errorReason, returnTo, router, queryClient]);

  if (message) {
    return (
      <div className="panel hairline p-5 text-center sm:p-7">
        <h1 className="text-2xl">Could not sign you in</h1>
        <p role="alert" className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">
          {message}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-10 items-center rounded-control border border-line bg-surface-3 px-4 text-sm"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="panel hairline p-5 text-center sm:p-7">
      <Skeleton className="mx-auto size-11 rounded-full" />
      <h1 className="mt-4 text-2xl">Signing you in…</h1>
      <p className="mt-2.5 text-[14px] text-ink-dim">One moment.</p>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      {/* `useSearchParams` suspends, so the boundary is required rather than
          optional — without it the build fails on this route. */}
      <Suspense fallback={<Skeleton className="h-52 w-full rounded-xl" />}>
        <CallbackInner />
      </Suspense>
    </main>
  );
}
