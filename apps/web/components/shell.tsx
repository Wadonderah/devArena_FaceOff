'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCompetitions, useCurrentUser, useLogout } from '@/lib/hooks';
import type { Team } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { LayoutGrid, LogOut, Trophy, Users, Wrench } from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/competitions', label: 'Competitions', icon: Trophy },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  const isStaff = user?.role === 'ORGANIZER' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Surface the participant's team in the header so it is reachable from
  // anywhere, rather than only by navigating through Competitions.
  const { data: competitions } = useCompetitions();
  const active = competitions?.find((c) => c.state === 'LIVE' || c.state === 'REGISTRATION');

  const { data: myTeam } = useQuery({
    queryKey: ['my-team', active?.id],
    queryFn: () => api<Team | null>(`/competitions/${active!.id}/teams/mine`),
    enabled: Boolean(active && user && !isStaff),
    retry: false,
  });

  const links = [
    ...NAV,
    ...(myTeam ? [{ href: `/teams/${myTeam.id}`, label: 'My team', icon: Users }] : []),
    ...(isStaff ? [{ href: '/admin', label: 'Organizer', icon: Wrench }] : []),
    ...(isSuperAdmin ? [{ href: '/admin/system', label: 'System', icon: Wrench }] : []),
  ];

  return (
    <div className="min-h-dvh flex flex-col">
      {/* A floating pill rather than a full-width bar with a bottom rule —
          the shape every reference uses, and it lets the background show
          through on both sides instead of slicing the page in two. */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 rounded-full border border-line bg-surface-0/80 px-4 backdrop-blur-xl sm:px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-[13px] font-bold text-white"
            >
              F
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight">
              Face-Off
            </span>
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1 overflow-x-auto">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors duration-150 whitespace-nowrap',
                    active
                      ? 'bg-surface-2 text-ink'
                      : 'text-ink-dim hover:bg-surface-2/60 hover:text-ink',
                  )}
                >
                  <link.icon aria-hidden size={15} strokeWidth={1.5} className="hidden sm:block" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {user && (
              <span className="hidden text-[13px] text-ink-faint sm:inline">{user.email}</span>
            )}
            <ThemeToggle />
            <Button
              size="sm"
              variant="ghost"
              loading={logout.isPending}
              icon={<LogOut />}
              onClick={() => logout.mutate(undefined, { onSettled: () => router.push('/login') })}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
