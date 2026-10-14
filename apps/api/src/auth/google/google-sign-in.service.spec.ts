import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { GoogleSignInService } from './google-sign-in.service';
import type { GoogleIdentity } from './google-oauth.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../../audit/audit.service';

const CTX = { ip: '1.2.3.4', userAgent: 'jest' };

const IDENTITY: GoogleIdentity = {
  sub: 'google-sub-1',
  email: 'ama@example.com',
  emailVerified: true,
  name: 'Ama Mensah',
};

const ACTIVE = {
  id: 'user-1',
  email: 'ama@example.com',
  role: Role.PARTICIPANT,
  emailVerified: true,
  isActive: true,
};

interface Overrides {
  linked?: unknown;
  existing?: unknown;
  created?: unknown;
  createThrows?: unknown;
}

function build(over: Overrides = {}) {
  const oauthCreate = jest.fn().mockResolvedValue({ id: 'oa-1' });
  const userUpdate = jest.fn().mockResolvedValue(ACTIVE);
  const refreshUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
  const tokenUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

  const userCreate = over.createThrows
    ? jest.fn().mockRejectedValue(over.createThrows)
    : jest.fn().mockResolvedValue(over.created ?? ACTIVE);

  const tx = {
    user: { update: userUpdate },
    oAuthAccount: { create: oauthCreate },
    refreshToken: { updateMany: refreshUpdateMany },
    verificationToken: { updateMany: tokenUpdateMany },
  };

  const prisma = {
    oAuthAccount: {
      findUnique: jest.fn().mockResolvedValue(over.linked ?? null),
      create: oauthCreate,
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(over.existing ?? null),
      create: userCreate,
      update: userUpdate,
    },
    refreshToken: { updateMany: refreshUpdateMany },
    verificationToken: {
      create: jest.fn().mockResolvedValue({ id: 'vt-1' }),
      updateMany: tokenUpdateMany,
      findUnique: jest.fn().mockResolvedValue({ user: ACTIVE }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;

  return {
    service: new GoogleSignInService(prisma, audit),
    prisma,
    audit,
    userCreate,
    userUpdate,
    oauthCreate,
    refreshUpdateMany,
    tokenUpdateMany,
  };
}

// ── Case 1: already linked ────────────────────────────────────────────────
describe('GoogleSignInService — an already-linked identity', () => {
  it('signs in the linked account', async () => {
    const { service, userCreate, oauthCreate } = build({ linked: { user: ACTIVE } });

    await expect(service.resolveAccount(IDENTITY, CTX)).resolves.toEqual({
      id: 'user-1',
      email: 'ama@example.com',
      role: Role.PARTICIPANT,
      emailVerified: true,
    });

    expect(userCreate).not.toHaveBeenCalled();
    expect(oauthCreate).not.toHaveBeenCalled();
  });

  // The link is keyed on Google's `sub`, not the email, because a Google user
  // can change their address and someone else can later be issued the one they
  // gave up. Matching on email would hand them the old owner's account.
  it('looks the link up by provider and subject, never by email', async () => {
    const { service, prisma } = build({ linked: { user: ACTIVE } });

    await service.resolveAccount(IDENTITY, CTX);

    expect((prisma as unknown as { oAuthAccount: { findUnique: jest.Mock } }).oAuthAccount.findUnique)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: 'google-sub-1' },
          },
        }),
      );
  });

  it('refuses a disabled account', async () => {
    const { service } = build({ linked: { user: { ...ACTIVE, isActive: false } } });

    await expect(service.resolveAccount(IDENTITY, CTX)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ── Case 2: brand new ─────────────────────────────────────────────────────
describe('GoogleSignInService — a new account', () => {
  it('creates one with no password and links it', async () => {
    const { service, userCreate } = build();

    await service.resolveAccount(IDENTITY, CTX);

    const data = userCreate.mock.calls[0][0].data;
    expect(data.passwordHash).toBeNull();
    expect(data.email).toBe('ama@example.com');
    expect(data.oauthAccounts.create).toEqual({
      provider: 'GOOGLE',
      providerAccountId: 'google-sub-1',
    });
  });

  // Nothing Google sends may influence the role. A `role` claim in a token
  // would otherwise be a privilege-escalation path straight past the console.
  it('always creates a participant, whatever the identity claims', async () => {
    const { service, userCreate } = build();

    await service.resolveAccount(
      { ...IDENTITY, ...({ role: 'SUPER_ADMIN' } as object) } as GoogleIdentity,
      CTX,
    );

    expect(userCreate.mock.calls[0][0].data.role).toBe(Role.PARTICIPANT);
  });

  it('carries Google’s own verification state, rather than assuming true', async () => {
    const { service, userCreate } = build();

    await service.resolveAccount({ ...IDENTITY, emailVerified: false }, CTX);

    expect(userCreate.mock.calls[0][0].data.emailVerified).toBe(false);
  });

  it('falls back to the email local part when Google sends no name', async () => {
    const { service, userCreate } = build();

    await service.resolveAccount({ ...IDENTITY, name: undefined }, CTX);

    expect(userCreate.mock.calls[0][0].data.profile.create.displayName).toBe('ama');
  });

  // Two first sign-ins racing. The unique constraints decide it; the loser
  // reads the winner's row rather than showing an error nobody can act on.
  it('recovers from a concurrent first sign-in', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const { service, prisma } = build({ createThrows: conflict });
    (prisma as unknown as { oAuthAccount: { findUnique: jest.Mock } }).oAuthAccount.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: ACTIVE });

    await expect(service.resolveAccount(IDENTITY, CTX)).resolves.toMatchObject({ id: 'user-1' });
  });
});

// ── Case 3: link to a verified account ───────────────────────────────────
describe('GoogleSignInService — an existing verified account', () => {
  it('links without touching the password', async () => {
    const { service, oauthCreate, userUpdate } = build({ existing: ACTIVE });

    await service.resolveAccount(IDENTITY, CTX);

    expect(oauthCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', provider: 'GOOGLE', providerAccountId: 'google-sub-1' },
    });
    // The owner's password still works afterwards; they now have two ways in.
    expect(userUpdate).not.toHaveBeenCalled();
  });

  // If Google will not vouch for the address, matching on it would let anyone
  // who can create a Google account with an unverified address claim one of
  // ours.
  it('refuses to reach an existing account on an unverified Google address', async () => {
    const { service, oauthCreate } = build({ existing: ACTIVE });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      service.resolveAccount({ ...IDENTITY, emailVerified: false }, CTX),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(oauthCreate).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

// ── Case 4: the pre-hijacking defence ────────────────────────────────────
//
// The attack: register with a victim's address, never verify it, set a password
// you know, and wait. When the victim later signs in with Google, a naive
// implementation links the two and the attacker's password opens the victim's
// account. Google has vouched for the address by this point, so the victim is
// the rightful owner and the squatter's credentials must not survive.
describe('GoogleSignInService — adopting an unverified account', () => {
  const squatted = { ...ACTIVE, emailVerified: false };

  it('strips the password', async () => {
    const { service, userUpdate } = build({ existing: squatted });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await service.resolveAccount(IDENTITY, CTX);

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: null, emailVerified: true }),
      }),
    );
    jest.restoreAllMocks();
  });

  it('revokes every existing session', async () => {
    const { service, refreshUpdateMany } = build({ existing: squatted });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await service.resolveAccount(IDENTITY, CTX);

    expect(refreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    jest.restoreAllMocks();
  });

  it('burns any outstanding reset or verification link', async () => {
    const { service, tokenUpdateMany } = build({ existing: squatted });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await service.resolveAccount(IDENTITY, CTX);

    expect(tokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    jest.restoreAllMocks();
  });

  it('clears a lockout left by someone guessing at that password', async () => {
    const { service, userUpdate } = build({ existing: squatted });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await service.resolveAccount(IDENTITY, CTX);

    expect(userUpdate.mock.calls[0][0].data).toMatchObject({
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    jest.restoreAllMocks();
  });

  // A link that committed without the revocation would leave exactly the
  // situation this defence exists to prevent.
  it('does all of it in one transaction', async () => {
    const { service, prisma } = build({ existing: squatted });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await service.resolveAccount(IDENTITY, CTX);

    expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });

  it('records it in the audit trail', async () => {
    const { service, audit } = build({ existing: squatted });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await service.resolveAccount(IDENTITY, CTX);

    expect((audit as unknown as { record: jest.Mock }).record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.google.adopted_unverified',
        metadata: expect.objectContaining({ passwordCleared: true, sessionsRevoked: true }),
      }),
    );
    jest.restoreAllMocks();
  });
});

// ── The one-time exchange code ────────────────────────────────────────────
describe('GoogleSignInService exchange code', () => {
  it('stores only a hash of the code', async () => {
    const { service, prisma } = build();

    const code = await service.issueExchangeCode('user-1');
    const stored = (prisma as unknown as { verificationToken: { create: jest.Mock } })
      .verificationToken.create.mock.calls[0][0].data;

    expect(stored.tokenHash).not.toBe(code);
    expect(stored.type).toBe('OAUTH_EXCHANGE');
    // Short-lived: it only has to survive one page load.
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(2 * 60 * 1000);
  });

  it('redeems a valid code once', async () => {
    const { service } = build();

    await expect(service.redeemExchangeCode('a'.repeat(43))).resolves.toMatchObject({
      id: 'user-1',
    });
  });

  // The claim is a single updateMany with every condition in the WHERE, so the
  // database decides a race. This code arrives in a URL, which is exactly the
  // kind of thing that gets opened twice.
  it('consumes the code atomically, in the where clause', async () => {
    const { service, tokenUpdateMany } = build();

    await service.redeemExchangeCode('a'.repeat(43));

    expect(tokenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'OAUTH_EXCHANGE',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
  });

  it('refuses a code that was already used or has expired', async () => {
    const { service, tokenUpdateMany } = build();
    tokenUpdateMany.mockResolvedValue({ count: 0 });

    await expect(service.redeemExchangeCode('a'.repeat(43))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // An organizer could have disabled the account in the two minutes between the
  // callback and the exchange.
  it('re-checks that the account is still active', async () => {
    const { service, prisma } = build();
    (prisma as unknown as { verificationToken: { findUnique: jest.Mock } })
      .verificationToken.findUnique.mockResolvedValue({ user: { ...ACTIVE, isActive: false } });

    await expect(service.redeemExchangeCode('a'.repeat(43))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
