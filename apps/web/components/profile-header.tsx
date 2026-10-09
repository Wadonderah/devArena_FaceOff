'use client';

import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser, useProfile } from '@/lib/hooks';
import { cn } from '@/lib/cn';

const STAFF_LABEL: Record<string, string> = {
  ORGANIZER: 'Organizer',
  SUPER_ADMIN: 'Administrator',
};

/// The dashboard's identity line: avatar and name only.
///
/// The sidebar already shows the avatar, email and role, so anything more here
/// is duplication. The role label is kept for staff, where it is real context.
export function ProfileHeader({ className }: { className?: string }) {
  const { data: user } = useCurrentUser();
  const { data: profile, isLoading } = useProfile();

  const displayName = profile?.profile?.displayName;
  const staffLabel = user ? STAFF_LABEL[user.role] : undefined;

  return (
    <header className={cn('flex items-center gap-2.5', className)}>
      <Avatar name={displayName ?? user?.email} src={profile?.profile?.avatarUrl} size={30} />

      {isLoading ? (
        // Same box as the line it replaces, so the layout does not shift.
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
