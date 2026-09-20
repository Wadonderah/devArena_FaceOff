import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/// What a rotation hands back. The refresh token is null when only the access
/// token was renewed — a grace-window replay. The browser already holds the
/// replacement refresh cookie from the rotation that won the race, so nothing
/// must be written over it.
export interface RotatedTokens {
  accessToken: string;
  refreshToken: string | null;
}

/// How long a just-rotated refresh token keeps working. Long enough to cover
/// several tabs refreshing at once and a slow round trip; short enough that a
/// stolen token replayed later is still caught.
const ROTATION_GRACE_MS = 30_000;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(
    user: { id: string; email: string; role: Role; emailVerified: boolean },
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const accessToken = await this.signAccess(user);

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: TokenService.hash(refreshToken),
        familyId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private signAccess(user: {
    id: string;
    email: string;
    role: Role;
    emailVerified: boolean;
  }): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };

    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('ACCESS_TOKEN_TTL') as JwtSignOptions['expiresIn'],
    });
  }

  /// Rotates a refresh token. A token that exists but has already been rotated is
  /// evidence the credential leaked — the whole family is revoked rather than the
  /// single token, forcing the real user and the attacker both to re-authenticate.
  async rotate(presentedToken: string): Promise<RotatedTokens> {
    const tokenHash = TokenService.hash(presentedToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true, role: true, emailVerified: true, isActive: true },
        },
      },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid session');
    }

    if (stored.revokedAt) {
      // A browser with several tabs open refreshes from each of them at once.
      // They all still hold the pre-rotation cookie, so without this every
      // multi-tab session would look like theft and be destroyed — which is
      // exactly what was happening in testing.
      //
      // Grace applies only to a token retired by a normal rotation, and only for
      // a few seconds. A replay after that, or of a token revoked by logout or by
      // a previous theft response, still revokes the family.
      if (
        stored.replacedByTokenHash &&
        stored.user.isActive &&
        Date.now() - stored.revokedAt.getTime() <= ROTATION_GRACE_MS
      ) {
        this.logger.debug(
          `Refresh replay inside the rotation grace window for user ${stored.userId}`,
        );

        // Access token only. The tab that lost the race just needs to finish its
        // request; the browser's cookie jar already holds the refresh token the
        // winning tab was given. Minting another one here meant every replay in
        // the window added a live token to the family — so a stolen token
        // replayed within 30 s yielded a persistent session of its own.
        return { accessToken: await this.signAccess(stored.user), refreshToken: null };
      }

      await this.revokeFamily(stored.familyId);
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; family ${stored.familyId} revoked`,
      );
      await this.audit.record({
        actorId: stored.userId,
        action: 'auth.refresh_token.reuse_detected',
        entityType: 'RefreshToken',
        entityId: stored.id,
        metadata: {
          familyId: stored.familyId,
          secondsSinceRevocation: Math.round((Date.now() - stored.revokedAt.getTime()) / 1000),
        },
      });
      throw new UnauthorizedException('Invalid session');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const replacement = await this.issue(stored.user, stored.familyId);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenHash: TokenService.hash(replacement.refreshToken),
      },
    });

    return replacement;
  }

  async revoke(presentedToken: string): Promise<void> {
    const tokenHash = TokenService.hash(presentedToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (stored && !stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
