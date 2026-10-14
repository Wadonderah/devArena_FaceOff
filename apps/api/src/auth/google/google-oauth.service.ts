import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../config/config.service';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/// Fails fast: a participant is on a blank redirect page while this runs.
const EXCHANGE_TIMEOUT_MS = 8000;

export interface GoogleIdentity {
  /// Stable subject id; the account link is keyed on this, never the email.
  sub: string;
  email: string;
  /// Google's own verification.
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/// Google's OAuth 2.0 authorization-code flow.
/// The `id_token` signature is not re-verified, and that is safe *only* because
/// of how it arrives: the code exchange is a server-to-server POST over TLS
/// authenticated with our client secret, so the response provably came from
/// Google in answer to a request only we could make. An id_token reaching us
/// any other way — handed over by a browser, say — must be verified.
/// Parsed rather than prefix-matched: `https://lh3.googleusercontent.com.evil.test/x`
/// passes a `startsWith` check and is not Google.
function isGoogleAvatar(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'googleusercontent.com' ||
        url.hostname.endsWith('.googleusercontent.com'))
    );
  } catch {
    return false;
  }
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(private readonly config: AppConfigService) {}

  /// Drives `GET /auth/providers`, so the button never appears without credentials.
  get isConfigured(): boolean {
    return Boolean(
      this.config.get('GOOGLE_CLIENT_ID') &&
        this.config.get('GOOGLE_CLIENT_SECRET') &&
        this.config.get('GOOGLE_REDIRECT_URI'),
    );
  }

  /// CSRF protection for the callback. There is no server-side session, so the
  /// state travels in a cookie; the HMAC is what stops a forged one passing.
  createState(): { state: string; signed: string } {
    const state = randomBytes(32).toString('base64url');
    return { state, signed: this.sign(state) };
  }

  verifyState(state: string | undefined, signed: string | undefined): boolean {
    if (!state || !signed) return false;

    const expected = Buffer.from(this.sign(state));
    const actual = Buffer.from(signed);

    // timingSafeEqual throws on a length mismatch rather than returning false.
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }

  private sign(state: string): string {
    return createHmac('sha256', this.config.get('JWT_ACCESS_SECRET')).update(state).digest('base64url');
  }

  /// Where to send the browser to get consent.
  authorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get('GOOGLE_CLIENT_ID') as string,
      redirect_uri: this.config.get('GOOGLE_REDIRECT_URI') as string,
      response_type: 'code',
      // Identity only. Anything more is standing permission we never use, and
      // non-sensitive scopes need no Google verification review.
      scope: 'openid email profile',
      state,
      // Otherwise someone with several Google accounts gets the browser default.
      prompt: 'select_account',
    });

    return `${AUTH_ENDPOINT}?${params.toString()}`;
  }

  /// Trade the one-time authorization code for the caller's identity.
  async exchangeCode(code: string): Promise<GoogleIdentity> {
    const body = new URLSearchParams({
      code,
      client_id: this.config.get('GOOGLE_CLIENT_ID') as string,
      client_secret: this.config.get('GOOGLE_CLIENT_SECRET') as string,
      redirect_uri: this.config.get('GOOGLE_REDIRECT_URI') as string,
      grant_type: 'authorization_code',
    });

    let response: Response;
    try {
      response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
      });
    } catch (error) {
      // Network or timeout — retryable, unlike the rejection below.
      this.logger.error(`Google token exchange could not be reached: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not reach Google. Please try again.');
    }

    if (!response.ok) {
      // Carries Google's error code (`invalid_grant`, `redirect_uri_mismatch`).
      // Logged in full — it is the only place the cause is visible — and never
      // returned to the caller.
      const detail = await response.text().catch(() => '');
      this.logger.error(`Google token exchange rejected (${response.status}): ${detail}`);
      throw new ServiceUnavailableException('Google sign-in failed. Please try again.');
    }

    const payload = (await response.json()) as { id_token?: string };
    if (!payload.id_token) {
      this.logger.error('Google token exchange returned no id_token');
      throw new ServiceUnavailableException('Google sign-in failed. Please try again.');
    }

    return this.decodeIdentity(payload.id_token);
  }

  /// See the class comment on why the signature is not re-verified.
  private decodeIdentity(idToken: string): GoogleIdentity {
    const segments = idToken.split('.');
    if (segments.length !== 3) {
      throw new ServiceUnavailableException('Google sign-in failed. Please try again.');
    }

    let claims: Record<string, unknown>;
    try {
      claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      throw new ServiceUnavailableException('Google sign-in failed. Please try again.');
    }

    const sub = typeof claims.sub === 'string' ? claims.sub : '';
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';

    // No sub means no stable identity to key on; no email means nothing to
    // match against. Neither is safe to guess at.
    if (!sub || !email) {
      this.logger.error('Google id_token carried no sub or no email');
      throw new ServiceUnavailableException('Google sign-in failed. Please try again.');
    }

    return {
      sub,
      email,
      // Boolean or the string "true" depending on vintage; anything else is
      // treated as unverified.
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      name: typeof claims.name === 'string' ? claims.name : undefined,
      // Host-checked: this ends up in an <img src> on our own origin.
      picture: isGoogleAvatar(claims.picture) ? (claims.picture as string) : undefined,
    };
  }
}
