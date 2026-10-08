'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser, useProfile } from '@/lib/hooks';

const ROLE_LABEL: Record<string, string> = {
  PARTICIPANT: 'Participant',
  ORGANIZER: 'Organizer',
  SUPER_ADMIN: 'Administrator',
};

/// The dashboard's identity block.
///
/// This replaced a heading that read `displayName ? 'Welcome back, X' : 'Dashboard'`.
/// `useProfile` is a separate query from the one AuthGate waits on, so for its
/// first few hundred milliseconds the page said "Dashboard" and then swapped to
/// a name — a visible flicker on every single load, and the first thing anyone
/// saw after signing in.
///
/// Two things fix it. The identity that is already known (email, role, and
/// therefore the initial) comes from `useCurrentUser`, which AuthGate has
/// resolved before this renders. Only the display name is still in flight, and
/// that gets a skeleton of the same height rather than a placeholder word, so
/// nothing moves and nothing says something untrue on the way.
export function ProfileHeader() {
  const { data: user } = useCurrentUser();
  const { data: profile, isLoading } = useProfile();

  const displayName = profile?.profile?.displayName;
  const firstName = displayName?.split(' ')[0];

  // From the email rather than the name: the email is known immediately, so the
  // avatar never changes letter underneath the reader.
  const initial = (user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <header className="mb-6 flex items-center gap-3.5 sm:gap-4">
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-[17px] font-semibold text-white sm:size-12 sm:text-lg"
      >
        {initial}
      </span>

      <div className="min-w-0">
        {isLoading ? (
          // Matches the rendered heading's box so the layout does not shift when
          // the name arrives.
          <Skeleton className="h-[1.9rem] w-52 rounded-md" />
        ) : (
          <h1 className="truncate text-2xl sm:text-3xl">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          </h1>
        )}

        <p className="mt-0.5 truncate text-[13px] text-ink-faint">
          {user ? (
            <>
              {ROLE_LABEL[user.role] ?? user.role}
              <span aria-hidden className="mx-1.5">
                ·
              </span>
              {user.email}
            </>
          ) : null}
        </p>
      </div>
    </header>
  );
}
