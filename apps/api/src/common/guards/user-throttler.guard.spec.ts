import type { ExecutionContext } from '@nestjs/common';
import { ACCOUNT_THROTTLER, UserThrottlerGuard } from './user-throttler.guard';

/// Exercises the key derivation only — the counting is the library's job.
/// The point being pinned: one IP with many emails yields many `account` keys
/// but one `default` key, which is what stops a venue from sharing a bucket
/// without letting an attacker rotate emails past the IP ceiling.

function contextFor(body: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body, ip: '10.0.0.1' }) }),
    getClass: () => ({ name: 'AuthController' }),
    getHandler: () => ({ name: 'login' }),
  } as unknown as ExecutionContext;
}

// `generateKey` is protected; the subclass exposes it for the test.
class Exposed extends UserThrottlerGuard {
  key(context: ExecutionContext, tracker: string, name: string) {
    return this.generateKey(context, tracker, name);
  }
}

function build() {
  // ThrottlerGuard's constructor wants options/storage/reflector; none are
  // touched by generateKey, so empty stand-ins are enough.
  return new Exposed(
    { throttlers: [] } as never,
    {} as never,
    { getAllAndOverride: () => undefined } as never,
  );
}

describe('UserThrottlerGuard key derivation', () => {
  it('keys the account throttler by IP and normalised email', () => {
    const guard = build();

    const a = guard.key(contextFor({ email: 'Ama@Example.com ' }), '10.0.0.1', ACCOUNT_THROTTLER);
    const b = guard.key(contextFor({ email: 'ama@example.com' }), '10.0.0.1', ACCOUNT_THROTTLER);
    const c = guard.key(contextFor({ email: 'kwame@example.com' }), '10.0.0.1', ACCOUNT_THROTTLER);

    expect(a).toBe(b); // case and whitespace do not split a bucket
    expect(a).not.toBe(c); // a different account at the same IP is a different bucket
  });

  it('keys every other throttler by tracker alone, ignoring the body', () => {
    const guard = build();

    const a = guard.key(contextFor({ email: 'ama@example.com' }), '10.0.0.1', 'default');
    const b = guard.key(contextFor({ email: 'kwame@example.com' }), '10.0.0.1', 'default');

    // Same IP, different emails → same IP-level bucket. This is the ceiling an
    // email-rotating attacker still runs into.
    expect(a).toBe(b);
  });

  it('does not throw on a body with no email', () => {
    const guard = build();
    expect(() => guard.key(contextFor({}), '10.0.0.1', ACCOUNT_THROTTLER)).not.toThrow();
  });
});
