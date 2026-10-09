import type { NotificationType } from './types';

/// Only ever follow a path within this app.
///
/// Same reasoning as `safeReturnTo`, applied one layer deeper. A notification's
/// `linkUrl` is written by the server today, so this is defence in depth rather
/// than a live hole — but it is stored data that a click navigates to, and
/// stored data outlives the code that wrote it. If a future announcement form
/// ever accepted a link, or a row were edited directly in the database, this is
/// the only thing between that and a navigation off-site from a trusted bell.
///
/// Returns null rather than a fallback: a notification with a bad link should
/// render as plain text, not quietly send the reader to the dashboard.
export function safeNotificationLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  // Protocol-relative: browsers read `//evil.com` as leaving the site.
  if (raw.startsWith('//')) return null;
  // Some browsers normalise a backslash to a forward slash, so `/\evil.com`
  // escapes the origin too.
  if (raw.startsWith('/\\')) return null;
  return raw;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/// Short, approximate age for a notification row.
///
/// Deliberately coarse. A bell is scanned, not read, and "2h" is the whole of
/// what the reader wants from a timestamp at that moment. Anything older than a
/// week gets a real date instead, because "63d" is not a thing anyone can
/// picture.
///
/// `now` is a parameter so this is testable without faking the clock.
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';

  // A clock skew between server and browser can put a notification a few
  // seconds in the future. "in 3 seconds" on a thing that just happened reads
  // as a bug, so anything not yet past is simply "now".
  const elapsed = now - then;
  if (elapsed < MINUTE) return 'now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d`;

  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/// How many unread notifications the badge will admit to.
///
/// Past this the exact number stops being information and starts being a wide
/// badge that shoves the rail's layout sideways.
export const UNREAD_CAP = 9;

export function formatUnread(count: number): string {
  return count > UNREAD_CAP ? `${UNREAD_CAP}+` : String(count);
}

/// Accessible wording for the bell itself.
///
/// The icon and the badge are both visual; a screen reader gets this instead,
/// and it has to carry the count because a lone "Notifications" would hide the
/// one fact the badge exists to convey.
export function bellLabel(count: number): string {
  if (count === 0) return 'Notifications, none unread';
  if (count === 1) return 'Notifications, 1 unread';
  return `Notifications, ${count} unread`;
}

/// Tone per type, used for the small leading dot on each row.
///
/// Operational alerts read as warnings; everything else is informational. The
/// dot is never the only signal — the title says what happened — so this is
/// emphasis, not meaning carried by colour alone.
export function toneFor(type: NotificationType): 'brand' | 'warn' | 'live' {
  if (type === 'GRADING_ALERT') return 'warn';
  if (type === 'ROUND_STARTED') return 'live';
  return 'brand';
}
