import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuthProvider, Prisma, Role, VerificationTokenType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { TokenService } from '../token.service';
import type { GoogleIdentity } from './google-oauth.service';
import type { RequestContext } from '../../common/request-context';

/// Travels in a redirect URL, so it only has to survive one page load.
const EXCHANGE_TTL_MS = 2 * 60 * 1000;

export interface SignedInUser {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

@Injectable()
export class GoogleSignInService {
  private readonly logger = new Logger(GoogleSignInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// Turn a verified Google identity into one of our accounts.
  ///
  /// The order of these four cases is the security of the feature:
  ///
  ///   1. `sub` already linked              → that account. Keyed on the
  ///      subject, never the email, because an address can change hands.
  ///   2. no link, no local account         → create one, with no password
  ///   3. no link, verified local account   → link
  ///   4. no link, unverified local account → see `adoptUnverifiedAccount`
  ///
  /// 3 and 4 require Google to vouch for the address. Without that, matching by
  /// email would let anyone able to attach an unverified address to a Google
  /// account claim one of ours.
  async resolveAccount(
    identity: GoogleIdentity,
    ctx: RequestContext,
  ): Promise<SignedInUser> {
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: OAuthProvider.GOOGLE,
          providerAccountId: identity.sub,
        },
      },
      select: {
        user: {
          select: { id: true, email: true, role: true, emailVerified: true, isActive: true },
        },
      },
    });

    if (linked) return this.assertActive(linked.user);

    const existing = await this.prisma.user.findUnique({
      where: { email: identity.email },
      select: { id: true, email: true, role: true, emailVerified: true, isActive: true },
    });

    if (!existing) return this.createAccount(identity, ctx);

    // An unverified Google address tells us nothing about who owns it, so it
    // may not be used to reach an existing account.
    if (!identity.emailVerified) {
      this.logger.warn(
        `Refused to link unverified Google address to existing account ${existing.id}`,
      );
      throw new UnauthorizedException(
        'Google has not verified that email address, so it cannot be linked to an existing account.',
      );
    }

    if (!existing.emailVerified) {
      return this.adoptUnverifiedAccount(existing, identity, ctx);
    }

    await this.link(existing.id, identity);
    await this.adoptAvatar(existing.id, identity);
    await this.audit.record({
      actorId: existing.id,
      action: 'auth.google.linked',
      entityType: 'User',
      entityId: existing.id,
      metadata: { provider: 'GOOGLE' },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.assertActive(existing);
  }

  /// A new account with no password. `role` is hardcoded, never read from the
  /// identity — a `role` claim would otherwise escalate past the console.
  private async createAccount(
    identity: GoogleIdentity,
    ctx: RequestContext,
  ): Promise<SignedInUser> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: identity.email,
          passwordHash: null,
          role: Role.PARTICIPANT,
          // Google's word, not an assumption: an unverified address produces
          // an unverified account, still gated by VerifiedEmailGuard.
          emailVerified: identity.emailVerified,
          profile: {
            create: {
              displayName: identity.name?.trim() || identity.email.split('@')[0],
              avatarUrl: identity.picture ?? null,
            },
          },
          oauthAccounts: {
            create: { provider: OAuthProvider.GOOGLE, providerAccountId: identity.sub },
          },
        },
        select: { id: true, email: true, role: true, emailVerified: true, isActive: true },
      });

      await this.audit.record({
        actorId: user.id,
        action: 'auth.google.registered',
        entityType: 'User',
        entityId: user.id,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });

      return this.assertActive(user);
    } catch (error) {
      // Two first sign-ins racing. The unique constraints decide it; the loser
      // reads the winner's row rather than erroring.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.resolveAfterRace(identity);
      }
      throw error;
    }
  }

  /// The pre-hijacking defence. Do not simplify this away.
  /// The attack: register with someone else's address, never verify it, set a
  /// password you know, and wait. When the owner later signs in with Google, a
  /// naive link hands your password their account.
  /// Google has vouched for the address by now (the caller checks), so the
  /// owner is the rightful holder: the password is cleared and every session
  /// revoked before the link. One transaction, because a link that committed
  /// without the revocation is exactly the situation this prevents.
  private async adoptUnverifiedAccount(
    existing: { id: string; email: string; role: Role; emailVerified: boolean; isActive: boolean },
    identity: GoogleIdentity,
    ctx: RequestContext,
  ): Promise<SignedInUser> {
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: null,
          emailVerified: true,
          // A lockout from someone guessing that password is not the owner's problem.
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
        select: { id: true, email: true, role: true, emailVerified: true, isActive: true },
      });

      await tx.oAuthAccount.create({
        data: {
          userId: existing.id,
          provider: OAuthProvider.GOOGLE,
          providerAccountId: identity.sub,
        },
      });

      if (identity.picture) {
        await tx.profile.updateMany({
          where: { userId: existing.id, avatarUrl: null },
          data: { avatarUrl: identity.picture },
        });
      }

      await tx.refreshToken.updateMany({
        where: { userId: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Outstanding reset and verification links were requested by the
      // previous holder, so they go too.
      await tx.verificationToken.updateMany({
        where: { userId: existing.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      return updated;
    });

    this.logger.warn(
      `Google sign-in adopted unverified account ${existing.id}: password cleared and sessions revoked`,
    );

    await this.audit.record({
      actorId: user.id,
      action: 'auth.google.adopted_unverified',
      entityType: 'User',
      entityId: user.id,
      metadata: { provider: 'GOOGLE', passwordCleared: true, sessionsRevoked: true },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return this.assertActive(user);
  }

  /// Fill an avatar, never replace one. `avatarUrl: null` in the where clause
  /// is the guard, and keeps it atomic against concurrent links.
  private async adoptAvatar(userId: string, identity: GoogleIdentity): Promise<void> {
    if (!identity.picture) return;

    await this.prisma.profile.updateMany({
      where: { userId, avatarUrl: null },
      data: { avatarUrl: identity.picture },
    });
  }

  private async link(userId: string, identity: GoogleIdentity): Promise<void> {
    await this.prisma.oAuthAccount.create({
      data: {
        userId,
        provider: OAuthProvider.GOOGLE,
        providerAccountId: identity.sub,
      },
    });
  }

  private async resolveAfterRace(identity: GoogleIdentity): Promise<SignedInUser> {
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: OAuthProvider.GOOGLE,
          providerAccountId: identity.sub,
        },
      },
      select: {
        user: {
          select: { id: true, email: true, role: true, emailVerified: true, isActive: true },
        },
      },
    });

    if (!linked) {
      // A different constraint fired than assumed; a retry takes the normal path.
      throw new UnauthorizedException('Could not complete Google sign-in. Please try again.');
    }

    return this.assertActive(linked.user);
  }

  /// Matches password login, so a provider cannot revive a disabled account.
  private assertActive<T extends { isActive: boolean }>(user: T): SignedInUser {
    if (!user.isActive) {
      throw new ForbiddenException('This account has been disabled.');
    }

    const { isActive: _ignored, ...rest } = user as T & SignedInUser;
    void _ignored;
    return rest as SignedInUser;
  }

  // The one-time exchange code 
  //
  // Exists because both auth cookies are SameSite=Strict, so the callback —
  // reached by a cross-site navigation — cannot set them. Stored hashed, so a
  // code found in a log or Referer header is useless on its own.

  async issueExchangeCode(userId: string): Promise<string> {
    const code = randomBytes(32).toString('base64url');

    await this.prisma.verificationToken.create({
      data: {
        userId,
        tokenHash: TokenService.hash(code),
        type: VerificationTokenType.OAUTH_EXCHANGE,
        expiresAt: new Date(Date.now() + EXCHANGE_TTL_MS),
      },
    });

    return code;
  }

  /// Every condition is in the `where`, so the database decides a race. This
  /// code arrives in a URL, which is exactly what gets opened twice.
  async redeemExchangeCode(code: string): Promise<SignedInUser> {
    const tokenHash = TokenService.hash(code);
    const now = new Date();

    const { count } = await this.prisma.verificationToken.updateMany({
      where: {
        tokenHash,
        type: VerificationTokenType.OAUTH_EXCHANGE,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (count !== 1) {
      throw new UnauthorizedException('That sign-in link has expired. Please try again.');
    }

    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
      select: {
        user: {
          select: { id: true, email: true, role: true, emailVerified: true, isActive: true },
        },
      },
    });

    if (!record) {
      throw new UnauthorizedException('That sign-in link has expired. Please try again.');
    }

    // Re-checked: the account could have been disabled between the two steps.
    return this.assertActive(record.user);
  }
}
