'use client';

import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser, useProfile } from '@/lib/hooks';
import { cn } from '@/lib/cn';

const STAFF_LABEL: Record<string, string> = {
  ORGANIZER: 'Organizer',
  SUPER_ADMIN: 'Administrator',
};

/// The dashboard's identity line.
///
/// Three rewrites, and the reasons are worth keeping because each was a
/// different mistake.
///
/// First it replaced a heading reading `displayName ? 'Welcome back, X' :
/// 'Dashboard'`. `useProfile` resolves after the query AuthGate waits on, so
/// for a few hundred milliseconds the page said "Dashboard" and then swapped to
/// a name — a visible flicker on every load.
///
/// Then the greeting went: "Welcome back" is the register of a newsletter, not
/// of a competition whose next screen is a timed round, and at `text-3xl` it was
/// the largest thing on a page whose subject is the competition below it.
///
/// Now the duplication has gone too. This showed an avatar, a name, the role
/// and the email — and the rail two inches to the left already showed the
/// avatar, the email and the role. Three of the four facts were on screen
/// twice, which is why it read as filler.
///
/// What is left is the one thing the rail does not show: who you are, by name.
/// The role survives only for staff, where it is genuine context — "you are
/// looking at this as an organizer" — and is noise for the participants who are
/// most of the users.
export function ProfileHeader({ className }: { className?: string }) {
  const { data: user } = useCurrentUser();
  const { data: profile, isLoading } = useProfile();

  const displayName = profile?.profile?.displayName;
  const staffLabel = user ? STAFF_LABEL[user.role] : undefined;

  return (
    <header className={cn('flex items-center gap-2.5', className)}>
      <Avatar name={displayName ?? user?.email} src={profile?.profile?.avatarUrl} size={30} />

      {isLoading ? (
        // Same box as the rendered line, so nothing shifts when it arrives.
        <Skeleton className="h-[1.05rem] w-36 rounded" />
      ) : (
        <h1 className="min-w-0 truncate text-[15px] font-medium leading-tight text-ink">
          {displayName ?? user?.email ?? ''}
        </h1>
      )}

      {staffLabel && (
        <span className="shrink-0 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">
          {staffLabel}
        </span>
      )}
    </header>
  );
}
