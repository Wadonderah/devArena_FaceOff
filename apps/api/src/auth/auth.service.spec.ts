import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokenService } from './token.service';
import type { MailService } from '../mail/mail.service';
import type { AppConfigService } from '../config/config.service';
import type { AuditService } from '../audit/audit.service';

const CTX = { ip: '203.0.113.9', userAgent: 'jest' };

// Low rounds keep the suite fast; the algorithm is what is under test, not the cost.
const passwordHash = bcrypt.hashSync('correct-horse-1', 4);

function build(userOverrides: Record<string, unknown> | null) {
  const user =
    userOverrides === null
      ? null
      : {
          id: 'user-1',
          email: 'ama@example.com',
          passwordHash,
          role: Role.PARTICIPANT,
          emailVerified: true,
          isActive: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
          profile: { displayName: 'Ama' },
          ...userOverrides,
        };

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;

  const tokens = {
    issue: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
  } as unknown as TokenService;

  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const config = { get: (k: string) => ({ BCRYPT_ROUNDS: 4 })[k] } as unknown as AppConfigService;
  const mail = { send: jest.fn() } as unknown as MailService;

  return { service: new AuthService(prisma, tokens, mail, config, audit), audit, prisma };
}

const actions = (audit: AuditService) =>
  (audit.record as jest.Mock).mock.calls.map(([e]) => e.action as string);

describe('AuthService.login', () => {
  it('records a success row with the caller IP and client', async () => {
    const { service, audit } = build({});

    await service.login({ email: 'ama@example.com', password: 'correct-horse-1' }, CTX);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login.success',
        actorId: 'user-1',
        ipAddress: CTX.ip,
        userAgent: CTX.userAgent,
      }),
    );
  });

  it('records a failure row for a wrong password', async () => {
    const { service, audit } = build({});

    await expect(
      service.login({ email: 'ama@example.com', password: 'nope-nope-1' }, CTX),
    ).rejects.toThrow(UnauthorizedException);

    expect(actions(audit)).toEqual(['auth.login.failed']);
  });

  it('records the lockout on the fifth failure', async () => {
    const { service, audit } = build({ failedLoginAttempts: 4 });

    await expect(
      service.login({ email: 'ama@example.com', password: 'nope-nope-1' }, CTX),
    ).rejects.toThrow(UnauthorizedException);

    expect(actions(audit)).toEqual(['auth.login.locked']);
  });

  describe('a locked account', () => {
    // It used to answer 403 "temporarily locked" — a distinct status that
    // confirmed the email existed and that a victim could be locked out on
    // demand. Now it is indistinguishable from a wrong password.
    it('answers exactly like a wrong password', async () => {
      const { service } = build({ lockedUntil: new Date(Date.now() + 60_000) });

      const locked = service.login({ email: 'ama@example.com', password: 'correct-horse-1' }, CTX);

      await expect(locked).rejects.toThrow(UnauthorizedException);
      await expect(locked).rejects.toThrow('Invalid email or password');
    });

    it('does not check the real password while locked', async () => {
      const { service, prisma } = build({ lockedUntil: new Date(Date.now() + 60_000) });

      await service
        .login({ email: 'ama@example.com', password: 'correct-horse-1' }, CTX)
        .catch(() => undefined);

      // No success path ran: nothing reset the counter or stamped lastLoginAt.
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('still leaves an audit row, so the owner can be told later', async () => {
      const { service, audit } = build({ lockedUntil: new Date(Date.now() + 60_000) });

      await service
        .login({ email: 'ama@example.com', password: 'anything-1' }, CTX)
        .catch(() => undefined);

      expect(actions(audit)).toEqual(['auth.login.refused_locked']);
    });
  });

  it('records nothing for an unknown email (no account to attribute it to)', async () => {
    const { service, audit } = build(null);

    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever-1' }, CTX),
    ).rejects.toThrow('Invalid email or password');

    expect(audit.record).not.toHaveBeenCalled();
  });
});

/// Google-only accounts have no password hash at all, which `bcrypt.compare`
/// cannot be handed.
describe('AuthService.login — an account with no password', () => {
  it('answers exactly like a wrong password', async () => {
    const { service } = build({ passwordHash: null });

    const attempt = service.login(
      { email: 'ama@example.com', password: 'anything-at-all' },
      CTX,
    );

    await expect(attempt).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(attempt).rejects.toThrow('Invalid email or password');
  });

  // A helpful "this account uses Google" would be an oracle for which addresses
  // are Google-only — useful to an attacker choosing where to aim a phishing
  // page, and useless to everyone else, since the sign-in screen already shows
  // the Google button to everybody.
  it('does not reveal that the account uses a provider', async () => {
    const { service } = build({ passwordHash: null });

    await expect(
      service.login({ email: 'ama@example.com', password: 'x' }, CTX),
    ).rejects.not.toThrow(/google|provider|oauth/i);
  });

  // Without the explicit null branch this threw a TypeError out of bcrypt,
  // which the filter would have rendered as a 500 — a different status and a
  // different response time from a wrong password, which is the leak.
  it('does not throw a TypeError out of bcrypt', async () => {
    const { service } = build({ passwordHash: null });

    await expect(
      service.login({ email: 'ama@example.com', password: 'x' }, CTX),
    ).rejects.not.toBeInstanceOf(TypeError);
  });

  it('still counts towards the lockout', async () => {
    const { service, prisma } = build({ passwordHash: null });

    await service
      .login({ email: 'ama@example.com', password: 'x' }, CTX)
      .catch(() => undefined);

    expect((prisma as unknown as { user: { update: jest.Mock } }).user.update).toHaveBeenCalled();
  });
});
