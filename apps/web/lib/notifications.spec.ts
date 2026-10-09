import {
  bellLabel,
  formatUnread,
  relativeTime,
  safeNotificationLink,
  toneFor,
} from './notifications';

describe('safeNotificationLink', () => {
  it('allows an app-relative path', () => {
    expect(safeNotificationLink('/rounds/r1/coding')).toBe('/rounds/r1/coding');
    expect(safeNotificationLink('/leaderboard/c1')).toBe('/leaderboard/c1');
  });

  it('refuses an absolute URL', () => {
    expect(safeNotificationLink('https://evil.example/phish')).toBeNull();
    expect(safeNotificationLink('http://evil.example')).toBeNull();
  });

  // Browsers read this as protocol-relative and leave the site, which is the
  // case a naive "starts with a slash" check lets straight through.
  it('refuses a protocol-relative URL', () => {
    expect(safeNotificationLink('//evil.example/phish')).toBeNull();
  });

  it('refuses a backslash-escaped origin', () => {
    expect(safeNotificationLink('/\\evil.example')).toBeNull();
  });

  it('refuses a javascript scheme', () => {
    expect(safeNotificationLink('javascript:alert(1)')).toBeNull();
  });

  // Null, not a fallback. A row with a broken link should render as text rather
  // than silently send the reader somewhere they did not choose.
  it('returns null for an absent link', () => {
    expect(safeNotificationLink(null)).toBeNull();
    expect(safeNotificationLink(undefined)).toBeNull();
    expect(safeNotificationLink('')).toBeNull();
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-08T12:00:00Z').getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('collapses the first minute to "now"', () => {
    expect(relativeTime(ago(0), now)).toBe('now');
    expect(relativeTime(ago(59_000), now)).toBe('now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(relativeTime(ago(60_000), now)).toBe('1m');
    expect(relativeTime(ago(45 * 60_000), now)).toBe('45m');
    expect(relativeTime(ago(2 * 3_600_000), now)).toBe('2h');
    expect(relativeTime(ago(3 * 86_400_000), now)).toBe('3d');
  });

  // "63d" is not a duration anyone can picture.
  it('switches to a date past a week', () => {
    expect(relativeTime(ago(30 * 86_400_000), now)).toMatch(/Sep/);
  });

  // Server and browser clocks disagree by a few seconds routinely. "in 3
  // seconds" on something that just happened reads as a bug.
  it('reports a future timestamp as "now" rather than negative', () => {
    expect(relativeTime(new Date(now + 5_000).toISOString(), now)).toBe('now');
  });

  it('renders nothing for an unparseable timestamp', () => {
    expect(relativeTime('not a date', now)).toBe('');
  });
});

describe('formatUnread', () => {
  it('shows the exact count up to the cap', () => {
    expect(formatUnread(0)).toBe('0');
    expect(formatUnread(9)).toBe('9');
  });

  // Past the cap the digits stop being information and start widening the
  // badge, which pushes the rail around.
  it('caps a large count', () => {
    expect(formatUnread(10)).toBe('9+');
    expect(formatUnread(412)).toBe('9+');
  });
});

describe('bellLabel', () => {
  // The badge is purely visual, so the count has to reach a screen reader
  // through the label or not at all.
  it('carries the count and reads naturally', () => {
    expect(bellLabel(0)).toBe('Notifications, none unread');
    expect(bellLabel(1)).toBe('Notifications, 1 unread');
    expect(bellLabel(5)).toBe('Notifications, 5 unread');
  });
});

describe('toneFor', () => {
  it('marks operational alerts as warnings', () => {
    expect(toneFor('GRADING_ALERT')).toBe('warn');
  });

  it('treats a starting round as live and everything else as informational', () => {
    expect(toneFor('ROUND_STARTED')).toBe('live');
    expect(toneFor('ANNOUNCEMENT')).toBe('brand');
    expect(toneFor('TEAM_JOINED')).toBe('brand');
    // An invitation, not an alarm: a competition opening is good news and does
    // not compete with a round that is live right now.
    expect(toneFor('COMPETITION_OPEN')).toBe('brand');
  });
});
