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
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('ACCESS_TOKEN_TTL') as JwtSignOptions['expiresIn'],
    });

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

  /// Rotates a refresh token. A token that exists but has already been rotated is
  /// evidence the credential leaked — the whole family is revoked rather than the
  /// single token, forcing the real user and the attacker both to re-authenticate.
  async rotate(presentedToken: string): Promise<IssuedTokens> {
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
      await this.revokeFamily(stored.familyId);
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; family ${stored.familyId} revoked`,
      );
      await this.audit.record({
        actorId: stored.userId,
        action: 'auth.refresh_token.reuse_detected',
        entityType: 'RefreshToken',
        entityId: stored.id,
        metadata: { familyId: stored.familyId },
      });
      throw new UnauthorizedException('Invalid session');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issue(stored.user, stored.familyId);
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
