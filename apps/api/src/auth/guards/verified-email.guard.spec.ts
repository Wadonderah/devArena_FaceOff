import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { VerifiedEmailGuard } from './verified-email.guard';
import type { AppConfigService } from '../../config/config.service';

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const configWith = (bypass: boolean) =>
  ({ get: (key: string) => (key === 'AUTH_SKIP_EMAIL_VERIFICATION' ? bypass : undefined) }) as unknown as AppConfigService;

describe('VerifiedEmailGuard', () => {
  describe('with verification enforced', () => {
    const guard = new VerifiedEmailGuard(configWith(false));

    it('allows a verified user', () => {
      expect(guard.canActivate(contextFor({ id: 'u1', emailVerified: true }))).toBe(true);
    });

    it('rejects an unverified user', () => {
      expect(() => guard.canActivate(contextFor({ id: 'u1', emailVerified: false }))).toThrow(
        ForbiddenException,
      );
    });

    it('fails closed with no user at all', () => {
      expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
    });
  });

  describe('with the development bypass on', () => {
    const guard = new VerifiedEmailGuard(configWith(true));

    it('lets an unverified user through', () => {
      expect(guard.canActivate(contextFor({ id: 'u1', emailVerified: false }))).toBe(true);
    });

    // The bypass short-circuits before reading the request, so it must not throw
    // on an absent user either.
    it('does not crash when there is no user', () => {
      expect(guard.canActivate(contextFor(undefined))).toBe(true);
    });
  });
});
