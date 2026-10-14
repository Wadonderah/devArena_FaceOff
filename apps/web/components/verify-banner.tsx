'use client';

import { MailCheck, MailWarning, Send } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useCurrentUser, useRecheckOnFocus, useResendVerification } from '@/lib/hooks';

/// Shown to a signed-in account that has not verified its email.
///
/// Unverified accounts are blocked by `VerifiedEmailGuard` from joining a
/// competition or submitting anything, so this is not a nag: it is the only
/// route out of a half-usable account. It therefore carries the action itself
/// rather than describing one.
export function VerifyBanner() {
  const { data: user } = useCurrentUser();
  const resend = useResendVerification();
  const toast = useToast();

  // Only listen while the banner is actually on screen. The link in the email
  // opens a second tab, so this is what makes the banner disappear when the
  // user comes back, instead of leaving them staring at a stale warning.
  useRecheckOnFocus(Boolean(user) && !user?.emailVerified);

  if (!user || user.emailVerified) return null;

  const send = () =>
    resend.mutate(undefined, {
      onSuccess: () => toast.success('Verification email sent', `Check the inbox for ${user.email}.`),
      onError: (error) =>
        toast.error(
          // The endpoint allows 3 sends an hour. A bare "failed" would send
          // someone hunting for a problem that does not exist.
          error instanceof ApiError && error.status === 429
            ? 'Too many requests'
            : 'Could not send the email',
          error instanceof ApiError && error.status === 429
            ? 'You can request another verification email in an hour.'
            : error instanceof ApiError
              ? error.displayMessage
              : 'Something went wrong. Try again in a moment.',
        ),
    });

  if (resend.isSuccess) {
    return (
      <div className="mb-6 rounded-xl border border-success/40 bg-success/10 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <MailCheck aria-hidden size={17} strokeWidth={1.5} className="shrink-0 text-success" />
          <p className="text-[14px] text-ink">
            Verification email sent to <strong className="font-semibold">{user.email}</strong>.
          </p>
        </div>

        {/* Separated from the confirmation above rather than run together with
            it: one is the outcome, the other is what to do if it fails. */}
        <p className="mt-2 border-t border-success/20 pt-2.5 pl-[29px] text-[13px] text-ink-dim">
          Open the link in that email, then return to this tab. If it has not arrived in a few
          minutes, check your spam folder.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3">
      <MailWarning aria-hidden size={17} strokeWidth={1.5} className="shrink-0 text-warn" />
      <Badge tone="warn">Action needed</Badge>

      <p className="text-[14px] text-ink-dim">
        Verify your email to join competitions and submit answers.
      </p>

      {/* ml-auto so the action sits at the far end on a wide banner, and simply
          wraps onto its own line when the copy no longer leaves room. */}
      <Button
        size="sm"
        variant="secondary"
        className="ml-auto"
        loading={resend.isPending}
        icon={<Send />}
        onClick={send}
      >
        Resend email
      </Button>
    </div>
  );
}
