'use client';

import { useQuery } from '@tanstack/react-query';
import { api, apiUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

/// Where to come back to after the round trip through Google.
///
/// `sessionStorage`, not a query parameter threaded through Google: the value
/// never leaves our origin, so it cannot be used to make our own callback
/// redirect somewhere else. It survives the cross-site trip because the tab
/// returns to the same origin it left, and it is read exactly once.
const RETURN_KEY = 'faceoff:oauth-return-to';

export function rememberReturnTo(path: string): void {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // Private mode, or storage disabled. The default landing page is fine.
  }
}

export function takeReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return value;
  } catch {
    return null;
  }
}

/// Which providers this deployment has credentials for.
///
/// Asked before rendering, so an environment without them shows a sign-in page
/// with no dead button on it. Cached hard — it changes only on deploy.
export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => api<{ google: boolean }>('/auth/providers'),
    staleTime: 60 * 60_000,
    retry: false,
  });
}

/// Google's mark. Inline so it is one request fewer, and it follows no theme —
/// Google's brand guidance requires the four colours as published.
function GoogleMark() {
  return (
    <svg aria-hidden width="17" height="17" viewBox="0 0 18 18" className="shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/// Sign in with Google.
///
/// A plain `<a>`, deliberately not a fetch. The browser has to make a top-level
/// navigation to Google so the consent screen loads in the address bar, where
/// someone can see the domain they are trusting — an XHR could not show them
/// that, and Google refuses to be framed.
///
/// Renders nothing when the provider is not configured, rather than a disabled
/// button: a greyed-out "Sign in with Google" invites people to keep pressing it.
export function GoogleSignInButton({
  returnTo,
  label = 'Continue with Google',
  className,
}: {
  returnTo?: string;
  label?: string;
  className?: string;
}) {
  const { data } = useAuthProviders();

  if (!data?.google) return null;

  return (
    <a
      href={apiUrl('/auth/google')}
      onClick={() => {
        if (returnTo) rememberReturnTo(returnTo);
      }}
      className={cn(
        'inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-control border border-line bg-surface-1 text-[15px] font-medium text-ink transition-colors',
        'hover:border-line-bright hover:bg-surface-2',
        className,
      )}
    >
      <GoogleMark />
      {label}
    </a>
  );
}

/// "or" between the provider button and the password form.
export function AuthDivider({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)} aria-hidden>
      <span className="h-px flex-1 bg-line" />
      <span className="text-[12px] uppercase tracking-[0.1em] text-ink-faint">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
