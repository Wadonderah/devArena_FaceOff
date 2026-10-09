'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, LogOut, Trophy, Users, Wrench } from 'lucide-react';
import { Monogram } from '@/components/brand-mark';
import { NotificationBell } from '@/components/notification-bell';
import { Avatar } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import { useCompetitions, useCurrentUser, useLogout, useProfile } from '@/lib/hooks';
import type { Team } from '@/lib/types';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/competitions', label: 'Competitions', icon: Trophy },
];

const ROLE_LABEL: Record<string, string> = {
  PARTICIPANT: 'Participant',
  ORGANIZER: 'Organizer',
  SUPER_ADMIN: 'Administrator',
};

/// The app shell: a left rail on desktop, a bottom bar on a phone.
///
/// This replaced a floating top bar. The bar worked, but everything still to
/// land wanted room it did not have — a notification bell with an unread badge,
/// and an identity block. On a phone it had already been reflowed to two rows
/// to stop the nav being squeezed off-screen, which was the warning sign.
///
/// The bell has since landed, in both places, and needed no layout change to
/// take it. The rail puts it beside the brand where a left rail conventionally
/// carries it; the phone strip puts it with the other controls, which is the
/// one spot on that layout with room for a popover.
///
/// A rail has vertical space to spare and grows downward rather than competing
/// sideways. On a phone a fixed bottom bar is the native pattern and puts the
/// targets in the half of the screen a thumb actually reaches.
///
/// The component keeps its name, so the eight pages that render it need no
/// change and a future shell swap is again one file.
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  const isStaff = user?.role === 'ORGANIZER' || user?.role === 'SUPER_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Surface the participant's team so it is reachable from anywhere, rather
  // than only by navigating through Competitions.
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

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const signOut = () => logout.mutate(undefined, { onSettled: () => router.push('/login') });

  // Shared with the dashboard's identity line through React Query's cache, so
  // this costs no extra request. The avatar falls back to an initial while it
  // loads, and for anyone who has not set one.
  const { data: profile } = useProfile();
  const displayName = profile?.profile?.displayName;

  return (
    <div className="min-h-dvh lg:flex">
      {/* ── Desktop rail ──────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface-1/60 px-3 py-4 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <Monogram size={26} />
            <span className="truncate text-sm font-semibold tracking-tight">Face-Off</span>
          </Link>
          {/* Only once there is a session. Rendering it for a signed-out
              visitor would poll an endpoint that can only 401. */}
          {user && <NotificationBell className="ml-auto" />}
        </div>

        <nav aria-label="Main" className="flex flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm transition-colors',
                isActive(link.href)
                  ? 'bg-surface-3 text-ink'
                  : 'text-ink-dim hover:bg-surface-2/60 hover:text-ink',
              )}
            >
              <link.icon aria-hidden size={16} strokeWidth={1.5} />
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3 border-t border-line pt-3">
          <div className="flex items-center gap-2.5 px-1">
            <Avatar name={displayName ?? user?.email} src={profile?.profile?.avatarUrl} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-ink">{user?.email ?? '—'}</span>
              <span className="block text-[11px] text-ink-faint">
                {user ? (ROLE_LABEL[user.role] ?? user.role) : ''}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="grid size-8 place-items-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <LogOut aria-hidden size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile top strip: brand, and what the bottom bar has no room for ── */}
      <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-line bg-surface-0/85 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Monogram size={22} />
          <span className="text-sm font-semibold tracking-tight">Face-Off</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {user && <NotificationBell />}
          <ThemeToggle />
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="grid size-8 place-items-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut aria-hidden size={16} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* pb-24 clears the fixed bottom bar, so the last element on a page is
          never hidden behind it. min-w-0 so a wide child cannot push the whole
          layout sideways. */}
      <main id="main" className="w-full min-w-0 flex-1 px-4 py-4 sm:py-6 pb-24 sm:px-6 lg:pb-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      {/* ── Mobile bottom bar ─────────────────────────────────────────── */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface-0/90 backdrop-blur-xl lg:hidden"
        // Keeps the targets clear of the home indicator on a notched phone.
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive(link.href) ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
              isActive(link.href) ? 'text-brand-bright' : 'text-ink-faint hover:text-ink-dim',
            )}
          >
            <link.icon aria-hidden size={18} strokeWidth={1.5} />
            <span className="max-w-full truncate px-1">{link.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
