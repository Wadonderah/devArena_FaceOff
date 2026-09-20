import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { TokenService } from './token.service';
import type { AppConfigService } from '../config/config.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;

const config = {
  get: (key: string) =>
    ({
      JWT_ACCESS_SECRET: 'x'.repeat(48),
      ACCESS_TOKEN_TTL: '15m',
      REFRESH_TOKEN_TTL_DAYS: 7,
    })[key],
} as unknown as AppConfigService;

const user = {
  id: 'user-1',
  email: 'alice@example.com',
  role: Role.PARTICIPANT,
  emailVerified: true,
  isActive: true,
};

function makePrisma(stored: unknown) {
  const refreshToken = {
    create: jest.fn().mockResolvedValue({}),
    findUnique: jest.fn().mockResolvedValue(stored),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 2 }),
  };
  return { refreshToken, asPrisma: { refreshToken } as unknown as PrismaService };
}

const createdData = (mock: jest.Mock, call = 0) =>
  mock.mock.calls[call][0].data as Record<string, string>;

function future(days = 1) {
  return new Date(Date.now() + days * 86_400_000);
}

describe('TokenService', () => {
  const jwt = new JwtService({});

  describe('hash', () => {
    it('is deterministic and does not return the input', () => {
      const hashed = TokenService.hash('secret-token');
      expect(hashed).toBe(TokenService.hash('secret-token'));
      expect(hashed).not.toContain('secret-token');
      expect(hashed).toHaveLength(64);
    });

    it('produces different digests for different tokens', () => {
      expect(TokenService.hash('a')).not.toBe(TokenService.hash('b'));
    });
  });

  describe('issue', () => {
    it('stores only the hash of the refresh token, never the token itself', async () => {
      const prisma = makePrisma(null);
      const service = new TokenService(jwt, prisma.asPrisma, config, audit);

      const { refreshToken } = await service.issue(user);
      const stored = createdData(prisma.refreshToken.create);

      expect(stored.tokenHash).toBe(TokenService.hash(refreshToken));
      expect(JSON.stringify(stored)).not.toContain(refreshToken);
    });

    it('keeps the caller-supplied family id when rotating within a family', async () => {
      const prisma = makePrisma(null);
      const service = new TokenService(jwt, prisma.asPrisma, config, audit);

      await service.issue(user, 'family-9');

      expect(createdData(prisma.refreshToken.create).familyId).toBe('family-9');
    });
  });

  describe('rotate', () => {
    it('rejects a token that was never issued', async () => {
      const service = new TokenService(jwt, makePrisma(null).asPrisma, config, audit);
      await expect(service.rotate('bogus')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the whole family when an already-rotated token is replayed later', async () => {
      const prisma = makePrisma({
        id: 'rt-1',
        userId: user.id,
        familyId: 'family-1',
        expiresAt: future(),
        // Rotated well outside the grace window.
        revokedAt: new Date(Date.now() - 5 * 60_000),
        replacedByTokenHash: 'some-hash',
        user,
      });
      const service = new TokenService(jwt, prisma.asPrisma, config, audit);

      await expect(service.rotate('stolen')).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    describe('rotation grace window', () => {
      // Several browser tabs refresh at once, each still holding the token that
      // the first one rotated away. Without grace this looked like theft and
      // destroyed the session — the cause of the mid-session sign-outs.
      const justRotated = (over: Record<string, unknown> = {}) => ({
        id: 'rt-1',
        userId: user.id,
        familyId: 'family-1',
        expiresAt: future(),
        revokedAt: new Date(Date.now() - 2_000),
        replacedByTokenHash: 'hash-of-the-replacement',
        user,
        ...over,
      });

      it('renews the access token for a replay inside the window', async () => {
        const prisma = makePrisma(justRotated());
        const service = new TokenService(jwt, prisma.asPrisma, config, audit);

        const issued = await service.rotate('same-token-from-another-tab');

        expect(issued.accessToken).toBeTruthy();
      });

      it('does not mint a new refresh token for a replay', async () => {
        // Each grace replay used to add a live refresh token to the family — so
        // a stolen token replayed within the window earned its own persistent
        // session. The losing tab only needs an access token; the browser
        // already holds the winner's refresh cookie.
        const prisma = makePrisma(justRotated());
        const service = new TokenService(jwt, prisma.asPrisma, config, audit);

        const issued = await service.rotate('same-token-from-another-tab');

        expect(issued.refreshToken).toBeNull();
        expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      });

      it('replaying three times yields three access tokens and zero refresh rows', async () => {
        const prisma = makePrisma(justRotated());
        const service = new TokenService(jwt, prisma.asPrisma, config, audit);

        await service.rotate('t');
        await service.rotate('t');
        await service.rotate('t');

        expect(prisma.refreshToken.create).not.toHaveBeenCalled();
        expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      });

      it('does not revoke the family for a replay inside the window', async () => {
        const prisma = makePrisma(justRotated());
        const service = new TokenService(jwt, prisma.asPrisma, config, audit);

        await service.rotate('same-token-from-another-tab');

        expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      });


      it('refuses grace to a token revoked by logout rather than rotation', async () => {
        // No replacement recorded means it was revoked deliberately, so a replay
        // is not a racing tab — grace must not resurrect a signed-out session.
        const prisma = makePrisma(justRotated({ replacedByTokenHash: null }));
        const service = new TokenService(jwt, prisma.asPrisma, config, audit);

        await expect(service.rotate('logged-out-token')).rejects.toThrow(UnauthorizedException);
        expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
      });

      it('refuses grace to a deactivated account', async () => {
        const prisma = makePrisma(justRotated({ user: { ...user, isActive: false } }));
        const service = new TokenService(jwt, prisma.asPrisma, config, audit);

        await expect(service.rotate('token')).rejects.toThrow(UnauthorizedException);
      });
    });

    it('records the replacement hash so a rotation is distinguishable from a revocation', async () => {
      const prisma = makePrisma({
        id: 'rt-1',
        userId: user.id,
        familyId: 'family-1',
        expiresAt: future(),
        revokedAt: null,
        user,
      });
      const service = new TokenService(jwt, prisma.asPrisma, config, audit);

      const issued = await service.rotate('valid');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: {
          revokedAt: expect.any(Date),
          // A genuine rotation always mints a replacement; only grace replays return null.
          replacedByTokenHash: TokenService.hash(issued.refreshToken!),
        },
      });
    });

    it('rejects an expired token without revoking the family', async () => {
      const prisma = makePrisma({
        id: 'rt-1',
        userId: user.id,
        familyId: 'family-1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        user,
      });
      const service = new TokenService(jwt, prisma.asPrisma, config, audit);

      await expect(service.rotate('expired')).rejects.toThrow(/expired/i);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a valid token belonging to a deactivated account', async () => {
      const prisma = makePrisma({
        id: 'rt-1',
        userId: user.id,
        familyId: 'family-1',
        expiresAt: future(),
        revokedAt: null,
        user: { ...user, isActive: false },
      });
      const service = new TokenService(jwt, prisma.asPrisma, config, audit);

      await expect(service.rotate('valid')).rejects.toThrow(/disabled/i);
    });

    it('revokes the presented token and issues a replacement in the same family', async () => {
      const prisma = makePrisma({
        id: 'rt-1',
        userId: user.id,
        familyId: 'family-1',
        expiresAt: future(),
        revokedAt: null,
        user,
      });
      const service = new TokenService(jwt, prisma.asPrisma, config, audit);

      const issued = await service.rotate('valid');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(createdData(prisma.refreshToken.create).familyId).toBe('family-1');
      expect(issued.accessToken).toBeTruthy();
      expect(issued.refreshToken).toBeTruthy();
    });
  });
});
