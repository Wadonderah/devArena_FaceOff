import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/config.service';
import { requestContext } from '../common/request-context';
import { CurrentUser, Public, type AuthenticatedUser } from '../common/decorators';
import { AuthService } from './auth.service';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

const minutes = (n: number) => n * 60_000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  // Two limits on every public auth route: `account` is per (IP, email) so a
  // venue's participants do not pool into one bucket; `default` is per IP and
  // looser, so rotating emails from one address still hits a ceiling.
  @Public()
  @Throttle({
    account: { limit: 3, ttl: minutes(60) },
    default: { limit: 100, ttl: minutes(60) },
  })
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // Every request counts, not only failures, so the per-account figure has to
  // leave room for a real person signing in a few times. Brute force against
  // one account is stopped by the persisted lockout, not by this.
  @Public()
  @Throttle({
    account: { limit: 10, ttl: minutes(15) },
    default: { limit: 200, ttl: minutes(15) },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, requestContext(req));
    setAuthCookies(res, this.config, result.tokens);
    return { user: result.user };
  }

  // No email here (cookie-driven), so IP-keyed. Every signed-in participant
  // refreshes every 15 minutes, so a venue needs headroom for all of them.
  @Public()
  @Throttle({ default: { limit: 600, ttl: minutes(15) } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];

    if (!presented) {
      throw new UnauthorizedException('No active session');
    }

    try {
      const tokens = await this.auth.refresh(presented);
      setAuthCookies(res, this.config, tokens);
      return { refreshed: true };
    } catch (error) {
      // Clear the cookies on any refresh failure so a revoked family cannot be
      // replayed on every subsequent page load.
      clearAuthCookies(res, this.config);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(presented);
    clearAuthCookies(res, this.config);
  }

  @Public()
  @Throttle({ default: { limit: 100, ttl: minutes(60) } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 3, ttl: minutes(60) } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.auth.resendVerification(user.id, user.email);
    return { message: 'Verification email sent.' };
  }

  @Public()
  @Throttle({
    account: { limit: 3, ttl: minutes(60) },
    default: { limit: 30, ttl: minutes(60) },
  })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: minutes(60) } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, requestContext(req));
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}
