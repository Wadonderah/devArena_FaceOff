import { validateEnv } from './env.validation';

const base = {
  WEB_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  JUDGE0_URL: 'http://localhost:2358',
  JUDGE0_TOKEN: 'token',
};

describe('validateEnv', () => {
  it('accepts a valid development configuration', () => {
    const env = validateEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.BCRYPT_ROUNDS).toBe(12);
  });

  it('parses CORS_ORIGINS into a trimmed list', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: 'https://devarena.akwannya-hub.org, https://api.akwannya-hub.org ,',
    });
    expect(env.CORS_ORIGINS).toEqual([
      'https://devarena.akwannya-hub.org',
      'https://api.akwannya-hub.org',
    ]);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('rejects reusing one secret for both access and refresh tokens', () => {
    const shared = 'c'.repeat(48);
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared }),
    ).toThrow(/must differ from JWT_ACCESS_SECRET/);
  });

  it('treats a blank optional value as unset rather than invalid', () => {
    const env = validateEnv({ ...base, RESEND_FROM_ADDRESS: '', COOKIE_DOMAIN: '' });
    expect(env.RESEND_FROM_ADDRESS).toBeUndefined();
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  describe('Resend key format', () => {
    // The key is stored bare and the service adds "Bearer ". Checking the
    // prefix at boot catches a truncated key, or one pasted from another
    // service, before it becomes a 401 on first send — and because send
    // failures are logged rather than thrown, that would otherwise surface as
    // "the email never arrived" on a registration that looked successful.
    const resend = {
      ...base,
      MAIL_DRIVER: 'resend',
      RESEND_FROM_ADDRESS: 'noreply@akwannya-hub.org',
    };

    it('accepts a key carrying the Resend prefix', () => {
      const env = validateEnv({ ...resend, RESEND_API_KEY: 're_abc123' });
      expect(env.RESEND_API_KEY).toBe('re_abc123');
    });

    it('refuses a key without the re_ prefix', () => {
      expect(() => validateEnv({ ...resend, RESEND_API_KEY: 'abc123' })).toThrow(/re_/);
    });

    it('refuses a key that still carries the Bearer scheme', () => {
      // Storing "Bearer re_..." would send "Bearer Bearer re_...".
      expect(() => validateEnv({ ...resend, RESEND_API_KEY: 'Bearer re_abc123' })).toThrow(
        /re_/,
      );
    });

    it('does not police the key when the console driver is in use', () => {
      expect(() =>
        validateEnv({ ...base, MAIL_DRIVER: 'console', RESEND_API_KEY: 'abc123' }),
      ).not.toThrow();
    });

    it('requires a sender address alongside the key', () => {
      expect(() =>
        validateEnv({ ...base, MAIL_DRIVER: 'resend', RESEND_API_KEY: 're_abc123' }),
      ).toThrow(/RESEND_FROM_ADDRESS/);
    });
  });

  it('requires Resend credentials when the resend driver is selected', () => {
    expect(() => validateEnv({ ...base, MAIL_DRIVER: 'resend' })).toThrow(/RESEND_API_KEY/);
  });

  it('refuses the console mail driver in production', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', MAIL_DRIVER: 'console' }),
    ).toThrow(/console driver must not be used in production/);
  });

  it('refuses insecure cookies in production', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        MAIL_DRIVER: 'resend',
        RESEND_API_KEY: 're_zt',
        RESEND_FROM_ADDRESS: 'noreply@akwannya-hub.org',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it('defaults the email-verification bypass to off', () => {
    expect(validateEnv({ ...base }).AUTH_SKIP_EMAIL_VERIFICATION).toBe(false);
  });

  it('allows the email-verification bypass in development', () => {
    const env = validateEnv({ ...base, AUTH_SKIP_EMAIL_VERIFICATION: 'true' });
    expect(env.AUTH_SKIP_EMAIL_VERIFICATION).toBe(true);
  });

  it('refuses to bypass email verification in production', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        MAIL_DRIVER: 'resend',
        RESEND_API_KEY: 're_zt',
        RESEND_FROM_ADDRESS: 'noreply@akwannya-hub.org',
        AUTH_SKIP_EMAIL_VERIFICATION: 'true',
      }),
    ).toThrow(/cannot be bypassed in production/);
  });

  it('rejects an out-of-range bcrypt cost', () => {
    expect(() => validateEnv({ ...base, BCRYPT_ROUNDS: '4' })).toThrow(/BCRYPT_ROUNDS/);
  });
});

describe('Google sign-in configuration', () => {
  it('is valid when neither value is set', () => {
    expect(() => validateEnv({ ...base })).not.toThrow();
  });

  // Half-configured is the dangerous state: an id with no secret gets as far as
  // redirecting someone to Google and then fails at the exchange, after they
  // have already approved the consent screen.
  it('rejects a client id without a secret', () => {
    expect(() => validateEnv({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow(
      /GOOGLE_CLIENT_SECRET/,
    );
  });

  it('rejects a secret without a client id', () => {
    expect(() => validateEnv({ ...base, GOOGLE_CLIENT_SECRET: 'shh' })).toThrow(
      /GOOGLE_CLIENT_ID/,
    );
  });

  // Google rejects the exchange unless redirect_uri byte-matches the console,
  // so there is no safe default to fall back on.
  it('requires a redirect uri once both credentials are present', () => {
    expect(() =>
      validateEnv({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'shh' }),
    ).toThrow(/GOOGLE_REDIRECT_URI/);
  });

  it('accepts a complete configuration', () => {
    expect(() =>
      validateEnv({
        ...base,
        GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'shh',
        GOOGLE_REDIRECT_URI: 'https://api.example.org/api/auth/google/callback',
      }),
    ).not.toThrow();
  });
});
