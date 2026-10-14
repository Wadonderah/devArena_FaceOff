import { ServiceUnavailableException } from '@nestjs/common';
import { GoogleOAuthService } from './google-oauth.service';
import type { AppConfigService } from '../../config/config.service';

const ENV: Record<string, unknown> = {
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'https://api.example.org/api/auth/google/callback',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

const makeService = (over: Record<string, unknown> = {}) =>
  new GoogleOAuthService({
    get: (key: string) => ({ ...ENV, ...over })[key],
  } as unknown as AppConfigService);

/// Base64url-encodes a payload into the middle segment of a fake id_token.
function idToken(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${body}.signature`;
}

describe('GoogleOAuthService.isConfigured', () => {
  it('is on only when all three values are present', () => {
    expect(makeService().isConfigured).toBe(true);
    expect(makeService({ GOOGLE_CLIENT_ID: undefined }).isConfigured).toBe(false);
    expect(makeService({ GOOGLE_CLIENT_SECRET: undefined }).isConfigured).toBe(false);
    // Without this, the flow gets as far as Google and dies at the exchange
    // with redirect_uri_mismatch — after the participant has already consented.
    expect(makeService({ GOOGLE_REDIRECT_URI: undefined }).isConfigured).toBe(false);
  });
});

describe('GoogleOAuthService state', () => {
  // The CSRF defence for the callback. Without it, an attacker can complete a
  // sign-in in a victim's browser using their own Google account.
  it('accepts the state it signed', () => {
    const service = makeService();
    const { state, signed } = service.createState();

    expect(service.verifyState(state, signed)).toBe(true);
  });

  it('rejects a state that was not signed with our secret', () => {
    const service = makeService();
    const { state } = service.createState();

    // An attacker who can set a cookie on our domain still cannot produce the
    // MAC without JWT_ACCESS_SECRET.
    const forged = makeService({ JWT_ACCESS_SECRET: 'b'.repeat(32) });
    const { signed: wrongMac } = forged.createState();

    expect(service.verifyState(state, wrongMac)).toBe(false);
  });

  it('rejects a mismatched pair, and anything missing', () => {
    const service = makeService();
    const a = service.createState();
    const b = service.createState();

    expect(service.verifyState(a.state, b.signed)).toBe(false);
    expect(service.verifyState(undefined, a.signed)).toBe(false);
    expect(service.verifyState(a.state, undefined)).toBe(false);
    expect(service.verifyState(a.state, '')).toBe(false);
  });

  // timingSafeEqual throws rather than returning false when the buffers differ
  // in length, so a short forged cookie would 500 instead of being rejected.
  it('rejects a signature of the wrong length without throwing', () => {
    const service = makeService();
    const { state } = service.createState();

    expect(() => service.verifyState(state, 'short')).not.toThrow();
    expect(service.verifyState(state, 'short')).toBe(false);
  });

  it('issues a different state every time', () => {
    const service = makeService();
    expect(service.createState().state).not.toBe(service.createState().state);
  });
});

describe('GoogleOAuthService.authorizationUrl', () => {
  it('asks only for identity scopes', () => {
    const url = new URL(makeService().authorizationUrl('nonce'));
    const scope = url.searchParams.get('scope')!.split(' ').sort();

    // Anything beyond these is standing permission we have no use for, and it
    // is the difference between a one-line consent screen and one that gives
    // people pause.
    expect(scope).toEqual(['email', 'openid', 'profile']);
    expect(url.searchParams.get('scope')).not.toMatch(/drive|contacts|offline/);
  });

  it('carries the state and asks which account to use', () => {
    const url = new URL(makeService().authorizationUrl('nonce-123'));

    expect(url.searchParams.get('state')).toBe('nonce-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    // Otherwise someone signed into several Google accounts is silently
    // assigned whichever the browser treats as default.
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('sends the configured redirect uri verbatim', () => {
    const url = new URL(makeService().authorizationUrl('n'));
    expect(url.searchParams.get('redirect_uri')).toBe(ENV.GOOGLE_REDIRECT_URI);
  });
});

describe('GoogleOAuthService.exchangeCode', () => {
  afterEach(() => jest.restoreAllMocks());

  const ok = (payload: unknown) =>
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as unknown as Response);

  it('returns the identity from the id_token', async () => {
    ok({
      id_token: idToken({
        sub: '1234567890',
        email: 'Ama@Example.com',
        email_verified: true,
        name: 'Ama Mensah',
      }),
    });

    const identity = await makeService().exchangeCode('auth-code');

    expect(identity).toEqual({
      sub: '1234567890',
      // Lower-cased, because our own accounts are keyed on a lower-cased email
      // and Google will happily send it capitalised.
      email: 'ama@example.com',
      emailVerified: true,
      name: 'Ama Mensah',
    });
  });

  it('posts the client secret and the code to the token endpoint', async () => {
    const spy = ok({ id_token: idToken({ sub: 's', email: 'a@b.co', email_verified: true }) });

    await makeService().exchangeCode('auth-code');

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const sent = new URLSearchParams(init.body as string);
    expect(sent.get('code')).toBe('auth-code');
    expect(sent.get('client_secret')).toBe('client-secret');
    expect(sent.get('grant_type')).toBe('authorization_code');
  });

  // Google reports a reused or expired code, or a console misconfiguration,
  // as a non-2xx. The detail is logged and never returned to the caller.
  it('fails cleanly when Google rejects the code', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    } as unknown as Response);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(makeService().exchangeCode('used-twice')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails cleanly when Google cannot be reached', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ETIMEDOUT'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(makeService().exchangeCode('code')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  // No sub means no stable identity to key the link on; no email means nothing
  // to match an existing account against. Neither is safe to guess at.
  it.each([
    ['no sub', { email: 'a@b.co', email_verified: true }],
    ['no email', { sub: '1', email_verified: true }],
  ])('refuses an id_token with %s', async (_label, claims) => {
    ok({ id_token: idToken(claims) });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(makeService().exchangeCode('code')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses a malformed id_token', async () => {
    ok({ id_token: 'not-a-jwt' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(makeService().exchangeCode('code')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  // Google sends this as a boolean or the string "true" depending on vintage,
  // and anything else must read as unverified rather than truthy.
  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    [undefined, false],
  ])('reads email_verified %p as %p', async (claim, expected) => {
    ok({ id_token: idToken({ sub: 's', email: 'a@b.co', email_verified: claim }) });

    const identity = await makeService().exchangeCode('code');
    expect(identity.emailVerified).toBe(expected);
  });
});

describe('GoogleOAuthService avatar claim', () => {
  afterEach(() => jest.restoreAllMocks());

  const withPicture = (picture: unknown) => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: idToken({ sub: 's', email: 'a@b.co', email_verified: true, picture }),
      }),
    } as unknown as Response);
    return makeService().exchangeCode('code');
  };

  it('accepts a Google-hosted avatar', async () => {
    const identity = await withPicture('https://lh3.googleusercontent.com/a/ACg8ocAbc=s96-c');
    expect(identity.picture).toBe('https://lh3.googleusercontent.com/a/ACg8ocAbc=s96-c');
  });

  it('accepts the bare apex host too', async () => {
    const identity = await withPicture('https://googleusercontent.com/a/x');
    expect(identity.picture).toBe('https://googleusercontent.com/a/x');
  });

  // The claim ends up in an <img src> on our own origin, so the host is checked
  // rather than trusted — even though it arrived over the authenticated
  // channel. A prefix test would pass this one, which is why it is parsed.
  it('rejects a lookalike host that would pass a prefix check', async () => {
    const identity = await withPicture('https://lh3.googleusercontent.com.evil.test/x');
    expect(identity.picture).toBeUndefined();
  });

  it.each([
    ['plain http', 'http://lh3.googleusercontent.com/a/x'],
    ['another origin', 'https://evil.test/avatar.png'],
    ['a javascript url', 'javascript:alert(1)'],
    ['not a url at all', 'not-a-url'],
    ['a number', 42],
    ['absent', undefined],
  ])('rejects %s', async (_label, picture) => {
    const identity = await withPicture(picture);
    expect(identity.picture).toBeUndefined();
  });
});
