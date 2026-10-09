import type { NotificationType } from './types';

/// Only follow app-relative paths. Returns null — a bad link should render as
/// plain text rather than silently redirect somewhere the reader did not pick.
export function safeNotificationLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  // `//evil.com` is protocol-relative and `/\evil.com` is normalised to it by
  // some browsers; both leave the origin despite starting with a slash.
  if (raw.startsWith('//')) return null;
  if (raw.startsWith('/\\')) return null;
  return raw;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/// Coarse age for a bell row: "now", "45m", "2h", "3d", then a date.
/// `now` is a parameter so this is testable without faking the clock.
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';

  // Clock skew can put a notification slightly in the future; clamp to "now".
  const elapsed = now - then;
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;

  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/// Past this the digits stop being information and start widening the badge.
export const UNREAD_CAP = 9;

export function formatUnread(count: number): string {
  return count > UNREAD_CAP ? `${UNREAD_CAP}+` : String(count);
}

/// The badge is purely visual, so the count has to reach a screen reader here.
export function bellLabel(count: number): string {
  if (count === 0) return 'Notifications, none unread';
  if (count === 1) return 'Notifications, 1 unread';
  return `Notifications, ${count} unread`;
}

/// Tone for the row's leading dot. Emphasis only — the title carries the
/// meaning, so nothing depends on colour alone.
export function toneFor(type: NotificationType): 'brand' | 'warn' | 'live' {
  if (type === 'GRADING_ALERT') return 'warn';
  if (type === 'ROUND_STARTED') return 'live';
  return 'brand';
}
