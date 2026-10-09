'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser, useProfile } from '@/lib/hooks';
import { cn } from '@/lib/cn';

const ROLE_LABEL: Record<string, string> = {
  PARTICIPANT: 'Participant',
  ORGANIZER: 'Organizer',
  SUPER_ADMIN: 'Administrator',
};

/// The dashboard's identity line.
///
/// Two rewrites, for two different reasons, both worth keeping recorded.
///
/// First it replaced a heading that read `displayName ? 'Welcome back, X' :
/// 'Dashboard'`. `useProfile` is a separate query from the one AuthGate waits
/// on, so for its first few hundred milliseconds the page said "Dashboard" and
/// then swapped to a name — a visible flicker on every load. The identity that
/// is already known (email, role, initial) comes from `useCurrentUser`, which
/// AuthGate has resolved before this renders; only the display name is still in
/// flight, and it gets a skeleton of the same height rather than a placeholder
/// word.
///
/// Then the greeting itself went. "Welcome back" is the register of a
/// newsletter, not of a competition where the next screen is a timed round, and
/// at `text-3xl` it was also the largest thing on the page — so the competition
/// someone actually came for sat below a greeting and a paragraph of
/// explanation. This is now a single compact line, and the weight belongs to
/// the competition panel beneath it.
export function ProfileHeader({ className }: { className?: string }) {
  const { data: user } = useCurrentUser();
  const { data: profile, isLoading } = useProfile();

  const displayName = profile?.profile?.displayName;

  // From the email rather than the name: the email is known immediately, so the
  // letter never changes underneath the reader.
  const initial = (user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <header className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-[14px] font-semibold text-white"
      >
        {initial}
      </span>

      <div className="min-w-0 flex-1">
        {isLoading ? (
          // Matches the rendered line's box so nothing shifts when it arrives.
          <Skeleton className="h-[1.1rem] w-40 rounded" />
        ) : (
          <h1 className="truncate text-[15px] font-medium leading-tight text-ink">
            {displayName ?? user?.email ?? ''}
          </h1>
        )}

        <p className="mt-0.5 truncate text-[12px] leading-tight text-ink-faint">
          {user ? (
            <>
              {ROLE_LABEL[user.role] ?? user.role}
              {displayName && (
                <>
                  <span aria-hidden className="mx-1.5">
                    ·
                  </span>
                  {user.email}
                </>
              )}
            </>
          ) : null}
        </p>
      </div>
    </header>
  );
}
