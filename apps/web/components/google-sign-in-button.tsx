'use client';

import { useQuery } from '@tanstack/react-query';
import { api, apiUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

/// `sessionStorage`, not a parameter threaded through Google: the value never
/// leaves our origin, so it cannot redirect our own callback elsewhere.
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

/// A deploy-time constant, so it can live in the bundle. Without it the button
/// waits on a post-hydration fetch and arrives after the rest of the form.
const BUILD_FLAG =
  process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === 'true'
    ? { google: true }
    : process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === 'false'
      ? { google: false }
      : undefined;

export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => api<{ google: boolean }>('/auth/providers'),
    // The API stays authoritative, so a wrong flag self-corrects.
    placeholderData: BUILD_FLAG,
    staleTime: 60 * 60_000,
    retry: false,
  });
}

/// Follows no theme: Google's brand guidance requires these four colours.
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

/// A plain `<a>`, not a fetch: the consent screen has to load as a top-level
/// navigation so the viewer can see whose domain they are trusting.
///
/// Renders nothing when unconfigured, rather than a button that cannot work.
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
