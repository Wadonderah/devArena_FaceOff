const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /// Validation failures arrive as a list of constraint messages; surfacing the
  /// first one is more useful to a participant than the generic wrapper text.
  get displayMessage(): string {
    return this.details?.[0] ?? this.message;
  }
}

/// Turn a thrown error into something worth showing a participant.
///
/// The rate limiter is the reason this exists. Nest's ThrottlerException carries
/// the message "ThrottlerException: Too Many Requests", which reached the UI
/// verbatim and read as a crash rather than as "wait a moment". The API's
/// exception filter already tags these `RATE_LIMITED`, so the code is a reliable
/// signal and the provider's wording never has to be trusted.
export function describeError(
  error: unknown,
  fallbackTitle = 'Something went wrong',
): { title: string; detail: string; rateLimited: boolean } {
  if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
    return {
      title: 'Going a bit fast',
      detail: 'Give it a few seconds, then try again.',
      rateLimited: true,
    };
  }

  return {
    title: fallbackTitle,
    detail:
      error instanceof ApiError ? error.displayMessage : 'Check your connection and try again.',
    rateLimited: false,
  };
}

let refreshInFlight: Promise<boolean> | null = null;

/// A single shared refresh promise. Without this, several components mounting at
/// once each fire their own refresh, and because the API rotates refresh tokens
/// the later ones would replay an already-rotated token — which the server treats
/// as theft and revokes the whole session.
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers all observe this result.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

/// Routes that must never trigger a refresh-and-retry on 401.
///
/// This replaced a blanket `!path.startsWith('/auth/')`, which was too broad by
/// exactly one route: `/auth/me` is the call that decides whether you are signed
/// in, and excluding it meant an expired access cookie signed you out even
/// though a perfectly good refresh cookie was sitting in the browser. Nothing
/// retried, so the Network tab showed no refresh attempt at all.
///
/// What genuinely belongs here is only what would recurse or is meaningless to
/// retry: refreshing the refresh call, and the three routes whose 401 is the
/// answer rather than an error.
const NO_REFRESH_RETRY = new Set(['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout']);

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  retryOnUnauthorized?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, retryOnUnauthorized = true } = options;

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 401 && retryOnUnauthorized && !NO_REFRESH_RETRY.has(path.split('?')[0])) {
    if (await refreshSession()) {
      return api<T>(path, { ...options, retryOnUnauthorized: false });
    }
  }

  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      problem?.code ?? 'ERROR',
      problem?.message ?? res.statusText,
      problem?.details,
    );
  }

  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

export const apiUrl = (path: string) => `${BASE}/api${path}`;
