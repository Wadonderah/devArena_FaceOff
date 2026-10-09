'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Shell } from '@/components/shell';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import type { Overview } from '@/lib/types';

/// Staff chrome: the same tokens as the participant shell, a different register.
///
/// Participants get room to think; staff get instruments. This strip is
/// deliberately dense and monospaced — an organizer mid-event is reading it,
/// not browsing it, and the one thing they must never miss is whether a round
/// is live, which is why that turns the top rule a different colour rather than
/// only changing a number.

const CONSOLE_NAV = [
  { href: '/admin', label: 'Console' },
  { href: '/admin/challenges', label: 'Library' },
  { href: '/admin/challenges/import', label: 'Import' },
  { href: '/admin/announcements', label: 'Announce' },
];

/// Longest matching prefix wins.
///
/// A plain `startsWith` would light up both Library and Import on
/// /admin/challenges/import — and every entry at once on /admin, since every
/// console route is nested under it.
function currentHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

function Readout({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone?: 'live' | 'warn' | 'danger';
}) {
  // A zero is good news for failures and bad news for nothing, so a zero never
  // takes an alarm colour — only a non-zero count earns it.
  const active = tone && (value ?? 0) > 0;

  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </span>
      <span
        className={cn(
          'tabular font-mono text-[13px] font-medium',
          active && tone === 'live' && 'text-live',
          active && tone === 'warn' && 'text-warn',
          active && tone === 'danger' && 'text-danger',
          !active && 'text-ink-dim',
        )}
      >
        {value ?? '··'}
      </span>
    </div>
  );
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();

  // Shares the query key with the console landing page, so react-query serves
  // both from one poll rather than doubling the request rate.
  const { data } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<Overview>('/admin/overview'),
    refetchInterval: 10_000,
  });

  const live = (data?.liveRounds ?? 0) > 0;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const nav = [
    ...CONSOLE_NAV,
    ...(isSuperAdmin ? [{ href: '/admin/system', label: 'System' }] : []),
  ];

  const active = currentHref(pathname, nav.map((link) => link.href));

  return (
    <Shell>
      <div className="mb-7 overflow-hidden rounded-xl border border-line bg-surface-1/70">
        {/* The event's pulse. Amber-idle, live-coloured and moving the moment a
            round opens — visible from across a room without reading a word. */}
        <div
          aria-hidden
          className={cn(
            'h-[3px] w-full',
            live
              ? 'animate-pulse bg-gradient-to-r from-live/30 via-live to-live/30'
              : 'bg-gradient-to-r from-transparent via-line-bright to-transparent',
          )}
        />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-2.5">
          <span
            className={cn(
              'rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]',
              isSuperAdmin
                ? 'border-warn/45 bg-warn/10 text-warn'
                : 'border-brand/45 bg-brand/10 text-brand-bright',
            )}
          >
            {isSuperAdmin ? 'Super admin' : 'Organizer'}
          </span>

          <span aria-hidden className="hidden h-4 w-px bg-line sm:block" />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Readout label="Live" value={data?.liveRounds} tone="live" />
            <Readout label="Queue" value={data?.pendingSubmissions} tone="warn" />
            <Readout label="Errors" value={data?.failedSubmissions} tone="danger" />
            <Readout label="Entrants" value={data?.participants} />
          </div>

          {/* Separated from the readouts and set a step brighter. These links
              were `text-ink-faint` at the same 11px as the readout labels
              immediately to their left, so the nav read as more instrument
              rather than as navigation — which is why a new tab added here went
              unfound. */}
          <span aria-hidden className="ml-auto hidden h-4 w-px bg-line sm:block" />

          <nav
            aria-label="Console"
            className="flex items-center gap-0.5 rounded-lg bg-surface-0/40 p-0.5"
          >
            {nav.map((link) => {
              const current = active === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors',
                    current
                      ? 'bg-surface-3 text-ink'
                      : 'text-ink-dim hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {children}
    </Shell>
  );
}
