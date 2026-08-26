'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCurrentUser } from '@/lib/hooks';
import { SkeletonRows } from '@/components/ui/skeleton';

/// Convenience only. Every protected resource is enforced server-side; this just
/// avoids showing a signed-out visitor an empty shell before the API refuses.
export function AuthGate({
  children,
  requireStaff,
}: {
  children: React.ReactNode;
  requireStaff?: boolean;
}) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  useEffect(() => {
    if (user && requireStaff && user.role === 'PARTICIPANT') router.replace('/dashboard');
  }, [user, requireStaff, router]);

  if (isLoading || !user) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <SkeletonRows rows={4} />
      </div>
    );
  }

  if (requireStaff && user.role === 'PARTICIPANT') return null;

  return <>{children}</>;
}
