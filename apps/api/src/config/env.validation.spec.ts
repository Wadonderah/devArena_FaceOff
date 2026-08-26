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
    const env = validateEnv({ ...base, ZEPTOMAIL_FROM_ADDRESS: '', COOKIE_DOMAIN: '' });
    expect(env.ZEPTOMAIL_FROM_ADDRESS).toBeUndefined();
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it('requires ZeptoMail credentials when the zeptomail driver is selected', () => {
    expect(() => validateEnv({ ...base, MAIL_DRIVER: 'zeptomail' })).toThrow(
      /ZEPTOMAIL_TOKEN/,
    );
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
        MAIL_DRIVER: 'zeptomail',
        ZEPTOMAIL_TOKEN: 'zt',
        ZEPTOMAIL_FROM_ADDRESS: 'noreply@akwannya-hub.org',
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
        MAIL_DRIVER: 'zeptomail',
        ZEPTOMAIL_TOKEN: 'zt',
        ZEPTOMAIL_FROM_ADDRESS: 'noreply@akwannya-hub.org',
        AUTH_SKIP_EMAIL_VERIFICATION: 'true',
      }),
    ).toThrow(/cannot be bypassed in production/);
  });

  it('rejects an out-of-range bcrypt cost', () => {
    expect(() => validateEnv({ ...base, BCRYPT_ROUNDS: '4' })).toThrow(/BCRYPT_ROUNDS/);
  });
});
