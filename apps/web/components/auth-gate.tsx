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
  requireSuperAdmin,
}: {
  children: React.ReactNode;
  requireStaff?: boolean;
  requireSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  useEffect(() => {
    if (user && requireStaff && user.role === 'PARTICIPANT') router.replace('/dashboard');
    if (user && requireSuperAdmin && user.role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [user, requireStaff, requireSuperAdmin, router]);

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
