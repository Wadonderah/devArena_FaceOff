'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/lib/hooks';
import {
  bellLabel,
  formatUnread,
  relativeTime,
  safeNotificationLink,
  toneFor,
} from '@/lib/notifications';
import type { AppNotification } from '@/lib/types';
import { cn } from '@/lib/cn';

const TONE_DOT: Record<'brand' | 'warn' | 'live', string> = {
  brand: 'bg-brand',
  warn: 'bg-warn',
  live: 'bg-live',
};

/// One notification row.
///
/// A link when it has a safe destination and a plain block when it does not —
/// rather than a link that goes nowhere, which is the mistake the dead "Ask for
/// their code" label made on the competition page.
function Row({
  notification,
  onRead,
  onNavigate,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onNavigate: () => void;
}) {
  const unread = notification.readAt === null;
  const href = safeNotificationLink(notification.linkUrl);

  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          unread ? TONE_DOT[toneFor(notification.type)] : 'bg-line-bright',
        )}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[13px]',
              unread ? 'font-medium text-ink' : 'text-ink-dim',
            )}
          >
            {notification.title}
          </span>
          <time
            dateTime={notification.createdAt}
            className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint"
          >
            {relativeTime(notification.createdAt)}
          </time>
        </span>

        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-relaxed text-ink-faint">
          {notification.body}
        </span>
      </span>
    </>
  );

  // The hover is applied per branch below, not here: a non-interactive row has
  // to cancel it, and `cn` is a plain join with no tailwind-merge — layering
  // `hover:bg-transparent` over `hover:bg-surface-2/60` would leave both in the
  // class list and let CSS source order decide.
  const shared = cn(
    'flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors',
    unread && 'bg-surface-2/30',
  );

  // Unread with nowhere to go still needs a way to be dismissed, so the row
  // itself marks read.
  if (!href && unread) {
    return (
      <button
        type="button"
        onClick={() => onRead(notification.id)}
        className={cn(shared, 'hover:bg-surface-2/60')}
      >
        {body}
      </button>
    );
  }

  // Read, and with nowhere to go: there is no action left, so it is not
  // presented as one. A plain div rather than a disabled button — a disabled
  // control is skipped by keyboard navigation, which would make an entire
  // notification unreachable to anyone not using a mouse.
  if (!href) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <Link
      href={href}
      onClick={() => {
        if (unread) onRead(notification.id);
        onNavigate();
      }}
      className={cn(shared, 'hover:bg-surface-2/60')}
    >
      {body}
    </Link>
  );
}

/// The bell, its badge, and the panel behind it.
///
/// The panel is a popover rather than a modal on purpose: a notification is
/// glanced at between other things, and a modal would dim the page and demand
/// to be dealt with. It closes on Escape, on a click outside and on navigating
/// away — the three ways anyone actually leaves one.
export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const { data: count } = useUnreadNotificationCount();
  const { data, isLoading, isError, refetch } = useNotifications(open);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // The badge comes from the polled count, but the list carries a fresher one
  // while the panel is open — and the optimistic update writes to both, so
  // preferring the list keeps the badge in step with rows being read.
  const unread = (open ? data?.unreadCount : undefined) ?? count?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    // `mousedown`, not `click`: a click fires after the target has already
    // acted, so a press on a row inside would close the panel before the
    // navigation it triggered.
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const items = data?.items ?? [];

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={bellLabel(unread)}
        className={cn(
          'relative grid size-8 place-items-center rounded-control transition-colors',
          open ? 'bg-surface-2 text-ink' : 'text-ink-faint hover:bg-surface-2 hover:text-ink',
        )}
      >
        <Bell aria-hidden size={16} strokeWidth={1.5} />

        {unread > 0 && (
          // aria-hidden because the count is already in the button's label;
          // announcing it twice is worse than not at all.
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-brand px-1 font-mono text-[9px] font-semibold leading-none text-white"
          >
            {formatUnread(unread)}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Notifications"
            initial={reduceMotion ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            // Pinned to the viewport on a phone, anchored to the bell on
            // desktop.
            //
            // `right-0` alone was wrong on mobile and the arithmetic says why:
            // the bell is not the last control in the phone strip — the theme
            // toggle and sign-out sit after it, about 140px of them. So the
            // bell's right edge is ~140px in from the viewport, and a panel
            // 358px wide anchored to it started at roughly -124px. The left
            // third was simply off-screen.
            //
            // A phone gets the standard sheet instead: fixed, full width less a
            // gutter each side, just below the 48px strip. The desktop rail
            // keeps the anchored popover, where the bell really is at the top
            // of a 240px column and there is room to the right.
            className={cn(
              'z-50 overflow-hidden rounded-xl border border-line bg-surface-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]',
              'fixed inset-x-4 top-14',
              'lg:absolute lg:inset-x-auto lg:left-0 lg:top-auto lg:mt-2 lg:w-[22rem]',
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <h2 className="text-[13px] font-medium text-ink">Notifications</h2>

              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="inline-flex items-center gap-1.5 rounded-control px-1.5 py-1 text-[11px] text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                >
                  <CheckCheck aria-hidden size={12} strokeWidth={1.5} />
                  Mark all read
                </button>
              )}
            </header>

            <div className="max-h-[min(22rem,60vh)] divide-y divide-line overflow-y-auto overscroll-contain">
              {isLoading ? (
                // Three rows of the same height as the real thing, so the panel
                // does not resize under the reader when the data lands.
                <div className="space-y-2 p-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 rounded-md" />
                  ))}
                </div>
              ) : isError ? (
                // Checked before the empty case on purpose. A failed fetch also
                // leaves `items` empty, so without this branch a request that
                // errored would render "Nothing yet" — telling the reader they
                // have no notifications when the truth is that we could not
                // find out.
                <div className="px-4 py-5 sm:py-8 text-center">
                  <p className="text-[13px] text-ink-dim">Could not load notifications</p>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="mt-2 rounded-control px-2 py-1 text-[12px] text-brand-bright underline underline-offset-4 transition-colors hover:bg-surface-2"
                  >
                    Try again
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-6 sm:py-9 text-center">
                  <BellOff
                    aria-hidden
                    size={18}
                    strokeWidth={1.5}
                    className="mx-auto text-ink-faint"
                  />
                  <p className="mt-2.5 text-[13px] text-ink-dim">Nothing yet</p>
                  <p className="mx-auto mt-1 max-w-[16rem] text-[12px] leading-relaxed text-ink-faint">
                    Rounds starting, results closing and messages from organizers will show up
                    here.
                  </p>
                </div>
              ) : (
                items.map((notification) => (
                  <Row
                    key={notification.id}
                    notification={notification}
                    onRead={(id) => markRead.mutate(id)}
                    onNavigate={() => setOpen(false)}
                  />
                ))
              )}
            </div>

            {/* Deliberately not a "load more": the panel is for what is recent.
                Anything that needs scrolling back through a history needs a
                page, and nothing yet does. */}
            {data?.nextCursor && (
              <footer className="border-t border-line px-3 py-2 text-center text-[11px] text-ink-faint">
                Showing your most recent notifications
              </footer>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
