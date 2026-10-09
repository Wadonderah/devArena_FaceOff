import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../../config/config.service';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/// Exchange timeout. A participant is sitting on a blank redirect page while
/// this runs, so it fails fast rather than hanging.
const EXCHANGE_TIMEOUT_MS = 8000;

export interface GoogleIdentity {
  /// Google's stable subject id. The thing the account link is keyed on.
  sub: string;
  email: string;
  /// Google's own verification of the address. False for some Workspace
  /// configurations, and the reason we do not blindly trust the email.
  emailVerified: boolean;
  name?: string;
}

/// Google's OAuth 2.0 authorization-code flow, implemented directly.
///
/// Deliberately not `passport-google-oauth20`, which the plan had pencilled in.
/// Three reasons, in order of weight:
///
///   1. Passport strategies register at module construction, so a deployment
///      with no client id either fails at boot or needs conditional provider
///      wiring — awkward for the one thing that must degrade quietly.
///   2. Our callback cannot sign anyone in (SameSite=Strict, see
///      OAUTH_EXCHANGE in the schema), so passport's "authenticate, attach
///      req.user, continue" shape does not fit the flow anyway.
///   3. It is two dependencies plus types for what is one redirect and one
///      POST.
///
/// On trusting the `id_token` without verifying its signature: the code
/// exchange below is a server-to-server POST to Google over TLS, authenticated
/// with our client secret. The response therefore came from Google, in answer
/// to a request only we could make. Signature verification exists for id_tokens
/// that arrive over an untrusted channel — one handed to us by a browser, say
/// — which is not this. Google's own server-flow guidance says the same.
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(private readonly config: AppConfigService) {}

  /// Whether the provider is usable at all. Drives `GET /auth/providers`, so
  /// the button never appears on a deployment that has no credentials.
  get isConfigured(): boolean {
    return Boolean(
      this.config.get('GOOGLE_CLIENT_ID') &&
        this.config.get('GOOGLE_CLIENT_SECRET') &&
        this.config.get('GOOGLE_REDIRECT_URI'),
    );
  }

  /// A random value, and its HMAC, for CSRF protection on the callback.
  ///
  /// `PassportModule.register({ session: false })` means there is nowhere to
  /// keep server-side state between the redirect out and the callback back, so
  /// the state travels in a short-lived cookie. Signing it means a forged
  /// cookie cannot pass: an attacker who can set cookies on our domain still
  /// cannot produce a valid MAC without JWT_ACCESS_SECRET.
  createState(): { state: string; signed: string } {
    const state = randomBytes(32).toString('base64url');
    return { state, signed: this.sign(state) };
  }

  /// Constant-time comparison of the callback's `state` against the cookie.
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
      // Only what is needed to identify someone. No Drive, no contacts, no
      // offline access — we never act on a participant's behalf, so asking for
      // a refresh token would be asking for standing permission we have no use
      // for, and it is the difference between a one-line consent screen and one
      // that gives people pause.
      scope: 'openid email profile',
      state,
      // Without this, a participant signed into several Google accounts is
      // silently assigned whichever one the browser considers default.
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
      // Network or timeout. Distinguished from a rejection below because this
      // one is worth retrying and that one never is.
      this.logger.error(`Google token exchange could not be reached: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not reach Google. Please try again.');
    }

    if (!response.ok) {
      // The body carries Google's own error code — `invalid_grant` for a reused
      // or expired code, `redirect_uri_mismatch` for a console misconfiguration.
      // Logged in full because it is the only place the cause is visible, and
      // never returned to the caller.
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

  /// Read the claims out of an id_token received over the authenticated channel
  /// above. See the class comment on why the signature is not re-verified here.
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

    // No sub means no stable identity to key the account link on, and no email
    // means nothing to match an existing account against. Either way there is
    // nothing safe to do.
    if (!sub || !email) {
      this.logger.error('Google id_token carried no sub or no email');
      throw new ServiceUnavailableException('Google sign-in failed. Please try again.');
    }

    return {
      sub,
      email,
      // Google sends this as a boolean or the string "true" depending on the
      // endpoint and the vintage. Anything else is treated as unverified.
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      name: typeof claims.name === 'string' ? claims.name : undefined,
    };
  }
}
