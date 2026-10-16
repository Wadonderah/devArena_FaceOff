'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, Trophy, Users, Wrench } from 'lucide-react';
import { Monogram } from '@/components/brand-mark';
import { NotificationBell } from '@/components/notification-bell';
import { Avatar } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { useCurrentUser, useLogout, useMyTeams, useProfile } from '@/lib/hooks';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/competitions', label: 'Competitions', icon: Trophy },
];

/// Survives reloads so the choice is made once, not every visit.
const RAIL_KEY = 'faceoff:rail';

/// Hover intent. Without a delay the rail opened on any pointer that crossed
/// it — including one merely travelling to the content — so it flew open and
/// shut as the mouse passed. Opening is the deliberate act and waits longest;
/// closing waits a little too, so cutting a corner on the way to a link does
/// not snap it shut mid-reach.
const OPEN_DELAY_MS = 220;
const CLOSE_DELAY_MS = 120;

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

  // Asked for directly rather than guessed at. This used to pick the first
  // LIVE-or-REGISTRATION competition and ask for the viewer's team in it, so a
  // newly opened competition with no teams hid the link for everyone — and it
  // was skipped entirely for staff, who can be participants too.
  const { data: myTeams } = useMyTeams();
  const myTeam = myTeams?.[0];

  const links = [
    ...NAV,
    ...(myTeam
      ? [
          {
            href: `/teams/${myTeam.id}`,
            // The rail has room for the real name, which is what makes this
            // findable; the phone bar does not.
            label: 'My team',
            longLabel: myTeam.name,
            icon: Users,
          },
        ]
      : []),
    ...(isStaff ? [{ href: '/admin', label: 'Organizer', icon: Wrench }] : []),
    ...(isSuperAdmin ? [{ href: '/admin/system', label: 'System', icon: Wrench }] : []),
  ] as { href: string; label: string; longLabel?: string; icon: typeof Users }[];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const signOut = () => logout.mutate(undefined, { onSettled: () => router.push('/login') });

  // Shared with the dashboard's identity line through React Query's cache, so
  // this costs no extra request. The avatar falls back to an initial while it
  // loads, and for anyone who has not set one.
  const { data: profile } = useProfile();
  const displayName = profile?.profile?.displayName;

  // Two independent reasons to be open. `peek` is the hover, which is
  // transient; `pinned` is a stated preference, which is not — and a rail that
  // only ever opens on hover is unusable for anyone who navigates by keyboard
  // or finds precise pointing difficult.
  const [pinned, setPinned] = useState(false);
  const [peek, setPeek] = useState(false);
  const expanded = pinned || peek;

  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /// One pending change at a time: entering then leaving quickly must cancel
  /// the open rather than queue an open and a close behind each other.
  const schedulePeek = (next: boolean) => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(
      () => setPeek(next),
      next ? OPEN_DELAY_MS : CLOSE_DELAY_MS,
    );
  };

  useEffect(() => () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
  }, []);

  // Read after mount rather than during render: the server has no localStorage,
  // and a different first render than first paint is a hydration error.
  useEffect(() => {
    try {
      setPinned(window.localStorage.getItem(RAIL_KEY) === 'pinned');
    } catch {
      // Private browsing, or storage disabled. Collapsed is a fine default.
    }
  }, []);

  const togglePin = () => {
    setPinned((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(RAIL_KEY, next ? 'pinned' : 'collapsed');
      } catch {
        // Preference is lost on reload; the rail still works this session.
      }
      return next;
    });
  };

  // Labels fade rather than unmount, so the icons never move and screen readers
  // keep reading a name for every link.
  const label = expanded ? 'truncate opacity-100 transition-opacity duration-150' : 'truncate opacity-0 transition-opacity duration-150';

  return (
    <div className="min-h-dvh lg:flex">
      {/* ── Desktop rail ──────────────────────────────────────────────── */}
      {/* A spacer that mirrors the rail's width exactly, so the page makes room
          for it rather than being covered by it.
          
          The rail was first built to open *over* the page, on the reasoning that
          reflowing on hover would be jumpy. On a 1440px screen that was wrong:
          the content is centred at max-w-6xl, so an expanding rail ate the
          112px margin and then 64px of the competition panel itself, with only
          a hairline between them — which reads as a z-index fault, not as a
          panel. Because this spacer and the rail share one width and one
          transition, the content edge and the rail edge move together, which is
          what makes it read as making room. */}
      <div
        aria-hidden
        className={cn(
          'hidden shrink-0 transition-[width] duration-300 ease-out-expo lg:block',
          expanded ? 'w-60' : 'w-16',
        )}
      />

      {/* z-40 is for what is inside: `position: fixed` creates a stacking
          context, so the notification panel's z-50 is ranked within this
          element and cannot otherwise clear a positioned `.panel`.

          Opaque, not `/60`: it is fixed rather than in flow, so page content
          scrolls beneath it at the top and bottom edges of the viewport. */}
      <aside
        onMouseEnter={() => schedulePeek(true)}
        onMouseLeave={() => schedulePeek(false)}
        // Focus opens it at once: a keyboard user has already committed, and
        // waiting 220ms after a Tab reads as lag rather than as restraint.
        onFocusCapture={() => setPeek(true)}
        onBlurCapture={() => schedulePeek(false)}
        className={cn(
          'fixed left-0 top-0 z-40 hidden h-dvh flex-col border-r border-line bg-surface-1 px-3 py-4 transition-[width] duration-300 ease-out-expo lg:flex',
          expanded ? 'w-60' : 'w-16',
        )}
      >
        <div className="flex items-center gap-2.5 px-2">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <Monogram size={26} />
            <span className={cn('text-sm font-semibold tracking-tight', label)}>Face-Off</span>
          </Link>

          {/* Only reachable once the rail is open, which is the only time it
              makes sense to press. */}
          <button
            type="button"
            onClick={togglePin}
            aria-label={pinned ? 'Unpin sidebar' : 'Keep sidebar open'}
            aria-pressed={pinned}
            className={cn(
              'ml-auto grid size-7 shrink-0 place-items-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink',
              expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            {pinned ? (
              <PanelLeftClose aria-hidden size={15} strokeWidth={1.5} />
            ) : (
              <PanelLeftOpen aria-hidden size={15} strokeWidth={1.5} />
            )}
          </button>
        </div>

        {/* On its own row rather than beside the brand: at the collapsed width
            a 26px monogram and a 32px bell cannot share a line, and the unread
            badge is the one thing in here that must stay visible when shut. */}
        {user && (
          <div className="mt-3 flex px-0.5">
            <NotificationBell />
          </div>
        )}

        <nav aria-label="Main" className="mt-6 flex flex-col gap-1">
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
              <link.icon aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
              <span className={label}>{link.longLabel ?? link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3 border-t border-line pt-3">
          <div className="flex items-center gap-2.5 px-1">
            <Avatar name={displayName ?? user?.email} src={profile?.profile?.avatarUrl} size={32} />
            <span className={cn('min-w-0 flex-1', expanded ? 'opacity-100 transition-opacity duration-150' : 'opacity-0 transition-opacity duration-150')}>
              <span className="block truncate text-[13px] text-ink">{user?.email ?? '—'}</span>
              <span className="block text-[11px] text-ink-faint">
                {user ? (ROLE_LABEL[user.role] ?? user.role) : ''}
              </span>
            </span>
          </div>

          {/* ThemeToggle is a three-way segmented control about 90px wide, and
              the collapsed rail has 40px of inner space. The aside deliberately
              has no `overflow-hidden` — that would clip the notification
              popover — so a toggle left mounted here spilled out past the rail
              rather than being cut off. It is dropped from the layout entirely
              while shut, which is also when it cannot be clicked. */}
          <div
            className={cn(
              'flex items-center gap-2',
              expanded ? 'justify-between' : 'justify-center',
            )}
          >
            {expanded && <ThemeToggle />}
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="grid size-8 shrink-0 place-items-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
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
          {/* The only identity on a phone: the rail is desktop-only, and with
              the name gone from the dashboard there was otherwise nothing on a
              shared venue laptop to say who is signed in. */}
          <Avatar
            name={displayName ?? user?.email}
            src={profile?.profile?.avatarUrl}
            size={26}
            className="ml-0.5"
          />
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
