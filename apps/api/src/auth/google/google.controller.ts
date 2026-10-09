import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AppConfigService } from '../../config/config.service';
import { requestContext } from '../../common/request-context';
import { Public } from '../../common/decorators';
import { TokenService } from '../token.service';
import { setAuthCookies } from '../cookies';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleSignInService } from './google-sign-in.service';
import { ExchangeCodeDto } from './dto/google.dto';

const minutes = (n: number) => n * 60_000;

const STATE_COOKIE = 'faceoff_oauth_state';

/// `lax`, not `strict` — the only such cookie in the app. It has to survive
/// Google's cross-site redirect back to us. Safe here because it carries no
/// authority: only a signed nonce, useless without Google's `state` parameter.
function stateCookieOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE'),
    sameSite: 'lax',
    domain: config.get('COOKIE_DOMAIN'),
    path: '/api/auth/google',
    maxAge: minutes(10),
  };
}

@Controller('auth')
export class GoogleController {
  constructor(
    private readonly google: GoogleOAuthService,
    private readonly signIn: GoogleSignInService,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
  ) {}

  /// Asked before the frontend renders a provider button.
  @Public()
  @Get('providers')
  providers() {
    return { google: this.google.isConfigured };
  }

  /// Step 1: send the browser to Google.
  @Public()
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  @Get('google')
  // Bare `@Res()`: with `passthrough` Nest also serialises the return value,
  // which throws "Cannot set headers after they are sent" after a redirect.
  start(@Res() res: Response) {
    // 404, not 503: without credentials this route does not exist, and 503
    // would imply a temporary outage.
    if (!this.google.isConfigured) {
      throw new NotFoundException('Google sign-in is not enabled.');
    }

    const { state, signed } = this.google.createState();
    res.cookie(STATE_COOKIE, signed, stateCookieOptions(this.config));

    return res.redirect(this.google.authorizationUrl(state));
  }

  /// Step 2: Google redirects back here.
  ///
  /// Sets no auth cookies, and must not: this is reached by a cross-site
  /// navigation, and a SameSite=Strict cookie set on such a response is
  /// silently dropped — the participant would land logged out with nothing in
  /// the logs. It mints a single-use code instead and redirects to our own
  /// origin to finish. Errors redirect too; a JSON body on an api.* URL is a
  /// dead end for someone mid sign-in.
  @Public()
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  @Get('google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const landing = `${this.config.get('WEB_URL')}/auth/callback`;
    const fail = (reason: string) => res.redirect(`${landing}?error=${reason}`);

    res.clearCookie(STATE_COOKIE, { ...stateCookieOptions(this.config), maxAge: undefined });

    if (!this.google.isConfigured) return fail('unavailable');

    // Cancelled at the consent screen. Not worth a scary message.
    if (error) return fail('cancelled');
    if (!code) return fail('cancelled');

    const signed = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
    if (!this.google.verifyState(state, signed)) {
      // A forged callback, or a stale tab. Both end the same way.
      return fail('state');
    }

    try {
      const identity = await this.google.exchangeCode(code);
      const user = await this.signIn.resolveAccount(identity, requestContext(req));
      const exchange = await this.signIn.issueExchangeCode(user.id);

      return res.redirect(`${landing}?code=${encodeURIComponent(exchange)}`);
    } catch {
      // Already logged with detail downstream; the browser gets a reason code.
      return fail('failed');
    }
  }

  /// Step 3: the landing page trades the code for cookies, same-site.
  @Public()
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  @Post('google/exchange')
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() dto: ExchangeCodeDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.signIn.redeemExchangeCode(dto.code);
    const tokens = await this.tokens.issue(user);

    // Same seam as password login: identical cookies, TTLs and rotation.
    setAuthCookies(res, this.config, tokens);

    return { user };
  }
}
