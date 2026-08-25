import { z } from 'zod';

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
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

    COOKIE_DOMAIN: optional(z.string().min(1)),
    COOKIE_SECURE: booleanish.default('true'),

    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

    JUDGE0_URL: z.string().url(),
    JUDGE0_TOKEN: z.string().min(1),

    MAIL_DRIVER: z.enum(['zeptomail', 'console']).default('console'),
    ZEPTOMAIL_TOKEN: optional(z.string().min(1)),
    ZEPTOMAIL_FROM_ADDRESS: optional(z.string().email()),
    ZEPTOMAIL_FROM_NAME: z.string().default('Software Engineering Face-Off'),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET',
      });
    }

    if (env.MAIL_DRIVER === 'zeptomail') {
      if (!env.ZEPTOMAIL_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ZEPTOMAIL_TOKEN'],
          message: 'required when MAIL_DRIVER is "zeptomail"',
        });
      }
      if (!env.ZEPTOMAIL_FROM_ADDRESS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ZEPTOMAIL_FROM_ADDRESS'],
          message: 'required when MAIL_DRIVER is "zeptomail"',
        });
      }
    }

    if (env.NODE_ENV === 'production') {
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
