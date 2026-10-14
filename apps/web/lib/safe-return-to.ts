/// Only ever follow a path within this app.
///
/// `returnTo` arrives in a query string, so without this an attacker could link
/// to /login?returnTo=https://example.com and borrow our own sign-in page to
/// bounce someone elsewhere — a phishing primitive that looks entirely genuine
/// because the domain in the address bar is ours right up until the redirect.
///
/// A leading `//` is rejected as well as an absolute URL: browsers read
/// `//evil.com` as protocol-relative and leave the site.
export function safeReturnTo(raw: string | null, fallback = '/dashboard'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  // A backslash is normalised to a forward slash by some browsers, so `/\\evil.com`
  // can escape the origin too.
  if (raw.startsWith('/\\')) return fallback;
  return raw;
}
