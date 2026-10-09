import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuthProvider, Prisma, Role, VerificationTokenType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { TokenService } from '../token.service';
import type { GoogleIdentity } from './google-oauth.service';
import type { RequestContext } from '../../common/request-context';

/// The exchange code is handed straight to the browser in a redirect URL, so it
/// lives only as long as it takes that page to load and POST it back.
const EXCHANGE_TTL_MS = 2 * 60 * 1000;

/// What `issue()` needs, and nothing more.
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
  /// Four cases, and the ordering between them is the security of the whole
  /// feature:
  ///
  ///   1. The `sub` is already linked  → that account, full stop. Keyed on the
  ///      subject rather than the email, because a Google user can change their
  ///      address and someone else can later be issued the one they gave up.
  ///   2. No link, no local account    → create one, with no password.
  ///   3. No link, verified local account → link them.
  ///   4. No link, UNVERIFIED local account → link, but strip the password and
  ///      revoke every session first. See `adoptUnverifiedAccount`.
  ///
  /// Cases 3 and 4 are reachable only when Google itself vouches for the
  /// address. If it does not, matching by email would let anyone who can create
  /// a Google account with an unverified address claim one of ours.
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

  /// A brand new account, with no password at all.
  ///
  /// `role` is hardcoded, never read from the identity. Nothing Google sends can
  /// influence it — a claim named `role` in a token would otherwise be a
  /// privilege-escalation path straight past the admin console.
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
          // Google's word for it, not ours. An unverified Google address
          // produces an unverified account, which still cannot join a
          // competition until it is verified by email like any other.
          emailVerified: identity.emailVerified,
          profile: {
            create: { displayName: identity.name?.trim() || identity.email.split('@')[0] },
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
      // Two first sign-ins racing on the same identity. The unique constraints
      // are what actually decide it; whichever lost simply reads the winner's
      // row and carries on, so the participant sees a successful sign-in rather
      // than an error they can do nothing about.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.resolveAfterRace(identity);
      }
      throw error;
    }
  }

  /// Link Google to a local account whose email was never verified.
  ///
  /// This is the pre-hijacking case, and it is the one place this feature could
  /// have given an account away. The attack: register with a victim's address
  /// and never verify it, set a password you know, and wait. When the victim
  /// later signs in with Google, a naive implementation links the two — and the
  /// attacker's password now opens the victim's account.
  ///
  /// Google has vouched for the address by this point (checked by the caller),
  /// so the victim is the rightful owner. Two things therefore happen before
  /// the link:
  ///
  ///   - the password is stripped, so whatever the attacker set is gone, and
  ///   - every refresh token is revoked, so any session they already hold dies.
  ///
  /// The owner can set a fresh password afterwards through the ordinary reset
  /// flow. Doing all of it in one transaction matters: a link that committed
  /// without the revocation would leave exactly the situation this prevents.
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
          // A pending lockout from someone guessing at that password is not the
          // owner's problem.
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

      await tx.refreshToken.updateMany({
        where: { userId: existing.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Any outstanding password-reset or verification link for this address
      // was requested by whoever held it before, so it goes too.
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
      // The constraint that fired was not the one we assumed. Rather than guess,
      // fail: a second attempt will take the ordinary path.
      throw new UnauthorizedException('Could not complete Google sign-in. Please try again.');
    }

    return this.assertActive(linked.user);
  }

  /// Same refusal as password login, so a disabled account cannot be revived by
  /// coming in through a provider instead.
  private assertActive<T extends { isActive: boolean }>(user: T): SignedInUser {
    if (!user.isActive) {
      throw new ForbiddenException('This account has been disabled.');
    }

    const { isActive: _ignored, ...rest } = user as T & SignedInUser;
    void _ignored;
    return rest as SignedInUser;
  }

  // ── The one-time exchange code ──────────────────────────────────────────
  //
  // Both auth cookies are SameSite=Strict, and a Strict cookie set on the
  // response to a cross-site navigation is dropped by the browser. Google's
  // redirect back to us IS such a navigation, so the callback cannot sign
  // anyone in. It mints one of these instead and redirects to a page on our own
  // origin, which POSTs it back same-site and gets real cookies.
  //
  // Stored hashed, like every other token here: a code read out of a log or a
  // Referer header is then useless on its own.

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

  /// Consume a code and return whose it was.
  ///
  /// The claim is a single `updateMany` with every condition in the `where`, so
  /// the database decides who wins a race. A read-then-write here would let two
  /// requests with the same code both pass — and this code arrives in a URL,
  /// which is precisely the kind of thing that gets opened twice.
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

    // Re-checked here, not just at resolve time: an organizer could have
    // disabled the account in the two minutes between the two steps.
    return this.assertActive(record.user);
  }
}
