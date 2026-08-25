import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OriginGuard } from './origin.guard';
import type { AppConfigService } from '../../config/config.service';

const ALLOWED = ['https://devarena.akwannya-hub.org'];

const config = {
  get: (key: string) => (key === 'CORS_ORIGINS' ? ALLOWED : undefined),
} as unknown as AppConfigService;

function contextFor(method: string, headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  const guard = new OriginGuard(config);

  it('ignores safe methods', () => {
    expect(guard.canActivate(contextFor('GET', { origin: 'https://evil.test' }))).toBe(true);
  });

  it('allows a mutation from an allowlisted origin', () => {
    expect(
      guard.canActivate(contextFor('POST', { origin: 'https://devarena.akwannya-hub.org' })),
    ).toBe(true);
  });

  it('rejects a mutation from an unknown origin', () => {
    expect(() => guard.canActivate(contextFor('POST', { origin: 'https://evil.test' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a sibling subdomain that is not allowlisted', () => {
    expect(() =>
      guard.canActivate(contextFor('POST', { origin: 'https://other.akwannya-hub.org' })),
    ).toThrow(ForbiddenException);
  });

  it('falls back to Referer when Origin is absent', () => {
    expect(
      guard.canActivate(
        contextFor('POST', { referer: 'https://devarena.akwannya-hub.org/rounds/1/mcq' }),
      ),
    ).toBe(true);
  });

  it('rejects a Referer from an unknown origin', () => {
    expect(() =>
      guard.canActivate(contextFor('POST', { referer: 'https://evil.test/attack' })),
    ).toThrow(ForbiddenException);
  });

  it('rejects a malformed Referer', () => {
    expect(() => guard.canActivate(contextFor('POST', { referer: 'not-a-url' }))).toThrow(
      ForbiddenException,
    );
  });

  it('permits non-browser clients that send neither header', () => {
    expect(guard.canActivate(contextFor('POST', {}))).toBe(true);
  });
});
