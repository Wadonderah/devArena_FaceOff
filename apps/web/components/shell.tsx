'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, LogOut, Trophy, Users, Wrench } from 'lucide-react';
import { Monogram } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import { useCompetitions, useCurrentUser, useLogout } from '@/lib/hooks';
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
/// land wants room it did not have — a notification bell with an unread badge,
/// and an identity block. On a phone it had already been reflowed to two rows
/// to stop the nav being squeezed off-screen, which was the warning sign.
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

  // From the email, which is known as soon as the session resolves, so the
  // letter never changes underneath the reader.
  const initial = (user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh flex flex-col">
      {/* A floating pill rather than a full-width bar with a bottom rule —
          the shape every reference uses, and it lets the background show
          through on both sides instead of slicing the page in two. */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
        {/* One row on desktop, two on a phone.
            
            As a single row the right-hand group and the brand consumed almost
            the whole width at 390px, leaving the nav a sliver that scrolled
            horizontally with no visible affordance — so an organizer could not
            reach the console from their phone at all. Wrapping lets the links
            take a full-width second row where they are actually tappable.
            
            `order` rather than duplicated markup, so each control exists once in
            the DOM and the tab order stays sensible in both layouts. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-line bg-surface-0/80 px-3 py-2.5 backdrop-blur-xl sm:h-14 sm:flex-nowrap sm:gap-6 sm:px-5 sm:py-0">
          {/* The monogram, not the full logo. The logo is a detailed circular
              illustration that needs room: at nav scale it is a colour blob,
              and sized to be legible it fills half the bar and reads as an
              avatar. The monogram keeps the one idea that survives small — the
              teal/orange split — and the wordmark is set in the nav's own type,
              so the lockup sits on the same line as the links rather than
              floating above it. */}
          <Link href="/dashboard" className="order-1 flex shrink-0 items-center gap-2.5">
            <Monogram size={24} />
            <span className="text-sm font-semibold tracking-tight">Face-Off</span>
          </Link>

          {/* Full width and last on a phone, so it gets a row of its own;
              inline and second on desktop. */}
          <nav
            aria-label="Main"
            className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 sm:order-2 sm:mx-0 sm:w-auto sm:px-0"
          >
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm transition-colors duration-150 whitespace-nowrap',
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

          <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:gap-3">
            {user && (
              <span className="hidden text-[13px] text-ink-faint sm:inline">{user.email}</span>
            )}
            <ThemeToggle />
            <Button
              size="sm"
              variant="ghost"
              loading={logout.isPending}
              icon={<LogOut />}
              // The label is hidden rather than removed on a phone: the button
              // still needs an accessible name, and sr-only keeps one without
              // spending the width.
              onClick={() => logout.mutate(undefined, { onSettled: () => router.push('/login') })}
            >
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
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
      <main id="main" className="w-full min-w-0 flex-1 px-4 py-6 pb-24 sm:px-6 lg:pb-8">
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
