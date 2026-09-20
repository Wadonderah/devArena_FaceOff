import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, VerificationTokenType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/request-context';
import { passwordResetEmail, verificationEmail } from '../mail/mail.templates';
import { TokenService, type IssuedTokens, type RotatedTokens } from './token.service';
import type {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const VERIFICATION_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 60;

// Compared against when the email is unknown, so a login attempt costs the same
// work whether or not the account exists. Without this the endpoint leaks which
// addresses are registered through response timing alone.
const DUMMY_HASH = '$2b$12$dJ7Yb9K.Vv6y5X0oQxV3ge0m0wq7HkH5eXtQxJ2rL3nR9lVQ0ZQ1e';

export interface AuthenticatedResult {
  tokens: IssuedTokens;
  user: { id: string; email: string; role: Role; emailVerified: boolean; displayName: string };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    // Registration always reports the same outcome. Telling the caller "that
    // email is taken" would turn this endpoint into an account enumeration oracle.
    if (existing) {
      this.logger.debug(`Registration attempted for existing email ${dto.email}`);
      return { message: 'Check your inbox to verify your account.' };
    }

    const passwordHash = await bcrypt.hash(dto.password, this.config.get('BCRYPT_ROUNDS'));
    const skipVerification = this.config.get('AUTH_SKIP_EMAIL_VERIFICATION');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: Role.PARTICIPANT,
        emailVerified: skipVerification,
        profile: { create: { displayName: dto.displayName } },
      },
      select: { id: true, email: true },
    });

    if (skipVerification) {
      this.logger.warn(
        `AUTH_SKIP_EMAIL_VERIFICATION is on — ${user.email} was created pre-verified`,
      );
      return { message: 'Account created. Email verification is disabled in this environment.' };
    }

    await this.sendVerificationEmail(user.id, user.email);

    return { message: 'Check your inbox to verify your account.' };
  }

  async login(dto: LoginDto, ctx: RequestContext): Promise<AuthenticatedResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        emailVerified: true,
        isActive: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        profile: { select: { displayName: true } },
      },
    });

    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException('Invalid email or password');
    }

    // A locked account answers exactly like a wrong password, and takes as long.
    // A distinct 403 here told an attacker two things: that the email exists,
    // and that five guesses would lock a victim out for fifteen minutes.
    //
    // The cost is that the legitimate owner is not told either; for fifteen
    // minutes a correct password reads as wrong. A lockout email would close
    // that gap without reopening the oracle — it is not sent today.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login.refused_locked',
        entityType: 'User',
        entityId: user.id,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      await this.recordFailedAttempt(user.id, user.failedLoginAttempts, ctx);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException('This account has been disabled.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    // Participant-side auth events were unrecorded: reconstructing a
    // compromised account rested on `lastLoginAt` alone. Every outcome now
    // leaves a row with the IP and client that produced it.
    await this.audit.record({
      actorId: user.id,
      action: 'auth.login.success',
      entityType: 'User',
      entityId: user.id,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    const tokens = await this.tokens.issue(user);

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        displayName: user.profile?.displayName ?? '',
      },
    };
  }

  async refresh(presentedToken: string): Promise<RotatedTokens> {
    return this.tokens.rotate(presentedToken);
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (presentedToken) {
      await this.tokens.revoke(presentedToken);
    }
  }

  async verifyEmail(rawToken: string): Promise<{ message: string }> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: TokenService.hash(rawToken) },
    });

    if (
      !record ||
      record.type !== VerificationTokenType.EMAIL_VERIFICATION ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('This verification link is invalid or has expired.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Email verified. You can now sign in.' };
  }

  async resendVerification(userId: string, email: string): Promise<void> {
    await this.sendVerificationEmail(userId, email);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true },
    });

    // Same response either way — see the note on register().
    if (user) {
      const rawToken = randomBytes(32).toString('base64url');

      // One live reset link per account. Requesting again supersedes the
      // previous one rather than leaving several 60-minute tokens valid.
      await this.prisma.verificationToken.updateMany({
        where: {
          userId: user.id,
          type: VerificationTokenType.PASSWORD_RESET,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });

      await this.prisma.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: TokenService.hash(rawToken),
          type: VerificationTokenType.PASSWORD_RESET,
          expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
        },
      });

      const url = `${this.config.get('WEB_URL')}/reset-password?token=${rawToken}`;
      await this.mail.send(passwordResetEmail(user.email, url));
    }

    return { message: 'If that email is registered, a reset link is on its way.' };
  }

  async resetPassword(dto: ResetPasswordDto, ctx: RequestContext): Promise<{ message: string }> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: TokenService.hash(dto.token) },
    });

    if (
      !record ||
      record.type !== VerificationTokenType.PASSWORD_RESET ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('This reset link is invalid or has expired.');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.config.get('BCRYPT_ROUNDS'));

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // A password change invalidates every existing session, so a stolen refresh
    // token cannot survive the reset that was meant to lock the attacker out.
    await this.tokens.revokeAllForUser(record.userId);

    await this.audit.record({
      actorId: record.userId,
      action: 'auth.password.reset',
      entityType: 'User',
      entityId: record.userId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { message: 'Password updated. You can now sign in.' };
  }

  private async recordFailedAttempt(
    userId: string,
    currentCount: number,
    ctx: RequestContext,
  ): Promise<void> {
    const attempts = currentCount + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
          : null,
      },
    });

    await this.audit.record({
      actorId: userId,
      action: shouldLock ? 'auth.login.locked' : 'auth.login.failed',
      entityType: 'User',
      entityId: userId,
      metadata: { attempt: attempts },
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });

    if (shouldLock) {
      this.logger.warn(`User ${userId} locked out after ${MAX_FAILED_ATTEMPTS} failed attempts`);
    }
  }

  private async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const rawToken = randomBytes(32).toString('base64url');

    await this.prisma.verificationToken.create({
      data: {
        userId,
        tokenHash: TokenService.hash(rawToken),
        type: VerificationTokenType.EMAIL_VERIFICATION,
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
      },
    });

    const url = `${this.config.get('WEB_URL')}/verify-email?token=${rawToken}`;
    await this.mail.send(verificationEmail(email, url));
  }
}
