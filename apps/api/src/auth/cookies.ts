import type { CookieOptions, Response } from 'express';
import type { AppConfigService } from '../config/config.service';

export const ACCESS_COOKIE = 'faceoff_at';
export const REFRESH_COOKIE = 'faceoff_rt';

// The refresh cookie is scoped to the auth routes so it is not attached to every
// API call — it only travels where it is actually needed.
const REFRESH_PATH = '/api/auth';

function baseOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE'),
    sameSite: 'strict',
    domain: config.get('COOKIE_DOMAIN'),
  };
}

export function setAuthCookies(
  res: Response,
  config: AppConfigService,
  tokens: { accessToken: string; refreshToken: string | null },
): void {
  const base = baseOptions(config);

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    path: '/',
    maxAge: 15 * 60 * 1000,
  });

  // A null refresh token means "leave the one the browser has" — it is newer
  // than anything this response could set.
  if (tokens.refreshToken === null) return;

  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_PATH,
    maxAge: config.get('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response, config: AppConfigService): void {
  const base = baseOptions(config);
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
}
