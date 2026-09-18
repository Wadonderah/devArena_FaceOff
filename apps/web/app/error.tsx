'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/// Route-level error boundary.
///
/// Without one, a client-side failure leaves a half-rendered page with no
/// explanation — which is how a form quietly degrading to plain HTML went
/// unnoticed. A visible failure is worth more than a tidy broken page.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5">
      <div className="panel hairline p-7">
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-live">
          Something broke
        </p>

        <h1 className="mt-3 font-display text-2xl tracking-[-0.02em]">
          This page could not be displayed
        </h1>

        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          Your session is unaffected. Try again, and if it keeps happening the message below
          identifies the fault.
        </p>

        {error.digest && (
          <p className="mt-4 rounded-lg border border-line bg-surface-0 px-3.5 py-2.5 font-mono text-[12px] text-ink-faint">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="glow-brand inline-flex h-10 items-center rounded-[10px] bg-brand px-4 text-sm font-medium text-white"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-[10px] border border-line px-4 text-sm"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
