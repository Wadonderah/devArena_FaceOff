import { z } from 'zod';
import { parseDuration } from '../common/duration';

/// Resend API keys are prefixed. Checking it at boot catches a truncated key, or
/// one pasted from a different service, before it becomes a 401 on first send.
///
/// Note the key is stored BARE here and the service adds "Bearer ". The previous
/// provider put its prefix inside the env var, and pasting the bare key from
/// their console produced a silent 401 on every send. Keeping the scheme in code
/// removes that whole class of mistake.
const RESEND_KEY_PREFIX = 're_';

const booleanish = z.enum(['true', 'false']).transform((v) => v === 'true');

// An env var present but blank (a placeholder line in .env) means "not set".
// Without this, `FOO=` fails an .optional() .email() check instead of skipping it.
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),

    WEB_URL: z.string().url(),
    CORS_ORIGINS: csv,

    DATABASE_URL: z.string().min(1),
    DIRECT_URL: optional(z.string().min(1)),

    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    // Validated rather than taken on trust: it now also sets the access
    // cookie's lifetime, so a malformed value would throw on the first login
    // instead of at boot, and only for whoever happened to log in first.
    ACCESS_TOKEN_TTL: z
      .string()
      .default('15m')
      .refine(
        (v) => {
          try {
            return parseDuration(v) > 0;
          } catch {
            return false;
          }
        },
        { message: 'must be a duration such as 15m, 2h or 900' },
      ),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

    COOKIE_DOMAIN: optional(z.string().min(1)),
    COOKIE_SECURE: booleanish.default('true'),

    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    // Development convenience: treats every account as verified and skips the
    // verification email. Rejected outright when NODE_ENV=production below, so
    // it cannot be switched on for a real competition.
    AUTH_SKIP_EMAIL_VERIFICATION: booleanish.default('false'),

    JUDGE0_URL: z.string().url(),
    JUDGE0_TOKEN: z.string().min(1),

    MAIL_DRIVER: z.enum(['resend', 'console']).default('console'),
    RESEND_API_KEY: optional(z.string().min(1)),
    RESEND_FROM_ADDRESS: optional(z.string().email()),
    RESEND_FROM_NAME: z.string().default('Software Engineering Face-Off'),

    /*
      Google sign-in. Both optional: with neither set the provider is simply
      off, `GET /auth/providers` reports it, and the button never renders. That
      is what lets this ship before the credentials exist, rather than making a
      missing client id a boot failure on every environment that does not have
      one yet.
    */
    GOOGLE_CLIENT_ID: optional(z.string().min(1)),
    GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),

    /*
      Stated, never derived.

      Google rejects a code exchange unless `redirect_uri` byte-matches one of
      the Authorised redirect URIs registered in the console. Building it from
      `req.protocol` + `req.get('host')` looks tidier and fails in exactly the
      place it is hardest to debug: behind Caddy the host header is right but
      the protocol is whatever the proxy hop used, so production silently sends
      `http://` and every sign-in dies at the exchange with `redirect_uri_mismatch`.

      In production this is https://api.akwannya-hub.org/api/auth/google/callback
      — note the `/api` prefix from setGlobalPrefix.
    */
    GOOGLE_REDIRECT_URI: optional(z.string().url()),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET',
      });
    }

    if (env.MAIL_DRIVER === 'resend') {
      if (!env.RESEND_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RESEND_API_KEY'],
          message: 'required when MAIL_DRIVER is "resend"',
        });
      } else if (!env.RESEND_API_KEY.startsWith(RESEND_KEY_PREFIX)) {
        // A send failure is logged rather than thrown, so a bad key shows up as
        // "the email never arrived" on top of a registration that appeared to
        // succeed. Fail at boot, where the cause is unmissable, instead.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RESEND_API_KEY'],
          message: `must start with "${RESEND_KEY_PREFIX}" — store the bare key, the "Bearer " scheme is added by the mail service`,
        });
      }
      if (!env.RESEND_FROM_ADDRESS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RESEND_FROM_ADDRESS'],
          message: 'required when MAIL_DRIVER is "resend"',
        });
      }
    }

    // Half-configured is the dangerous state: an id with no secret gets as far
    // as redirecting a participant to Google and then fails at the code
    // exchange, after they have already approved the consent screen. Either
    // both or neither.
    const googleId = Boolean(env.GOOGLE_CLIENT_ID);
    const googleSecret = Boolean(env.GOOGLE_CLIENT_SECRET);

    if (googleId !== googleSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [googleId ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID'],
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together, or neither',
      });
    }

    if (googleId && googleSecret && !env.GOOGLE_REDIRECT_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_REDIRECT_URI'],
        message: 'required when Google sign-in is configured',
      });
    }

    if (env.NODE_ENV === 'production') {
      if (env.AUTH_SKIP_EMAIL_VERIFICATION) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_SKIP_EMAIL_VERIFICATION'],
          message:
            'email verification cannot be bypassed in production — unverified accounts must not compete',
        });
      }
      if (env.MAIL_DRIVER === 'console') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MAIL_DRIVER'],
          message: 'the console driver must not be used in production',
        });
      }
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECURE'],
          message: 'must be true in production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}
