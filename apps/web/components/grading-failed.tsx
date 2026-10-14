'use client';

import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/// Shown when a submission ends in SYSTEM_ERROR.
///
/// One component because the coding and debugging rounds were telling
/// participants different things about the same state: coding hardcoded its own
/// copy, while debugging rendered the server's `errorMessage` verbatim — which
/// said "An organizer has been notified", a claim nothing in the API backed up.
///
/// The server message is deliberately not rendered here. It is written for a
/// log, not for someone mid-round, and the two round types showing the same
/// words matters more than echoing whatever the worker happened to store.
export function GradingFailed({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3.5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-warn">We could not grade that attempt</p>
        {/* Says the two things that are actually load-bearing: it was not their
            fault, and retrying costs them nothing. A SYSTEM_ERROR is excluded
            from attempt accounting on the server. */}
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-dim">
          Something went wrong on our side, not in your code. This does not count against your
          attempts, so you can submit the same solution again.
        </p>
      </div>

      <Button size="sm" variant="secondary" loading={retrying} icon={<RotateCw />} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
