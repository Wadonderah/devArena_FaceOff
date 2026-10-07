'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCurrentUser } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { SkeletonRows } from '@/components/ui/skeleton';

/// Convenience only. Every protected resource is enforced server-side; this just
/// avoids showing a signed-out visitor an empty shell before the API refuses.
export function AuthGate({
  children,
  requireStaff,
  requireSuperAdmin,
}: {
  children: React.ReactNode;
  requireStaff?: boolean;
  requireSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError, error, isFetching } = useCurrentUser();

  // Only an actual authentication failure ends the session. Redirecting on ANY
  // error meant a restarting API or a momentary network drop signed people out
  // mid-round with a perfectly valid session.
  const unauthenticated = error instanceof ApiError && error.status === 401;

  // Reaching here means the session really is gone: the API client already
  // tried a refresh and it failed. Carry where they were, so a participant
  // bounced out of a round returns to that round rather than the dashboard.
  //
  // Relative paths only, built from `usePathname()`, so this cannot be turned
  // into an open redirect.
  useEffect(() => {
    if (!unauthenticated) return;

    const target =
      pathname && pathname !== '/login'
        ? `/login?returnTo=${encodeURIComponent(pathname)}&reason=expired`
        : '/login';

    router.replace(target);
  }, [unauthenticated, router, pathname]);

  useEffect(() => {
    if (user && requireStaff && user.role === 'PARTICIPANT') router.replace('/dashboard');
    if (user && requireSuperAdmin && user.role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [user, requireStaff, requireSuperAdmin, router]);

  // Reachable but not signed out: the request failed for some other reason and
  // React Query is retrying. Say so, rather than showing a skeleton forever or
  // bouncing to the login page.
  if (isError && !unauthenticated) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6">
        <p className="text-[15px] text-ink-dim">
          {isFetching ? 'Reconnecting…' : 'Cannot reach the server.'}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-faint">
          You are still signed in. This will recover on its own.
        </p>
      </div>
    );
  }

  if (isLoading || !user) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (requireStaff && user.role === 'PARTICIPANT') return null;
  if (requireSuperAdmin && user.role !== 'SUPER_ADMIN') return null;

  return <>{children}</>;
}
