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

/// The state cookie is the one cookie here that MUST survive a cross-site
/// navigation, because it is read when Google redirects back. So it is `lax`
/// rather than `strict` — the single deliberate exception in the app, and the
/// reason the rest of the flow needs the exchange dance at all.
///
/// `lax` is safe for this one: it is sent on a top-level GET navigation, which
/// is exactly the callback and nothing else, and it carries no authority of its
/// own — only a signed nonce that is useless without the matching `state`
/// parameter from Google.
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

  /// Which providers this deployment can actually use.
  ///
  /// The frontend asks before rendering a Google button, so an environment
  /// without credentials shows a sign-in page with no dead button on it —
  /// rather than one that sends people to a broken redirect.
  @Public()
  @Get('providers')
  providers() {
    return { google: this.google.isConfigured };
  }

  /// Step 1: send the browser to Google.
  @Public()
  @Throttle({ default: { limit: 30, ttl: minutes(15) } })
  @Get('google')
  // Bare `@Res()`, not `@Res({ passthrough: true })`.
  //
  // Passthrough hands the response back to Nest to serialise the return value,
  // which is right for `exchange` below — it sets cookies and then returns a
  // body. It is wrong for a redirect: `res.redirect()` has already sent the
  // headers, so Nest trying to send `undefined` afterwards throws "Cannot set
  // headers after they are sent to the client". `callback` gets this right
  // already; this one did not.
  start(@Res() res: Response) {
    // 404 rather than 503: on a deployment with no credentials this route does
    // not meaningfully exist, and saying so is less misleading than implying a
    // temporary outage.
    if (!this.google.isConfigured) {
      throw new NotFoundException('Google sign-in is not enabled.');
    }

    const { state, signed } = this.google.createState();
    res.cookie(STATE_COOKIE, signed, stateCookieOptions(this.config));

    return res.redirect(this.google.authorizationUrl(state));
  }

  /// Step 2: Google redirects back here.
  ///
  /// This handler deliberately sets no auth cookies. It is reached by a
  /// cross-site navigation, and both auth cookies are SameSite=Strict, so any
  /// it set would be silently dropped by the browser — the participant would
  /// land on the dashboard logged out, with nothing in the logs to say why.
  ///
  /// Instead it mints a short-lived single-use code and redirects to a page on
  /// our own origin, which exchanges it same-site. Errors redirect too, with a
  /// reason in the query string: throwing here would render a JSON error body
  /// at an api.* URL, which is a dead end for someone who was signing in.
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

    // The participant pressed Cancel on the consent screen. Not an error worth
    // a scary message.
    if (error) return fail('cancelled');
    if (!code) return fail('cancelled');

    const signed = (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE];
    if (!this.google.verifyState(state, signed)) {
      // Either a forged callback or a stale tab. Both end the same way.
      return fail('state');
    }

    try {
      const identity = await this.google.exchangeCode(code);
      const user = await this.signIn.resolveAccount(identity, requestContext(req));
      const exchange = await this.signIn.issueExchangeCode(user.id);

      return res.redirect(`${landing}?code=${encodeURIComponent(exchange)}`);
    } catch {
      // The underlying services have already logged the cause with detail. All
      // the browser gets is a reason code the landing page can phrase.
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

    // The same seam password login uses, so a Google session is identical to
    // any other from here on — same cookies, same TTLs, same rotation.
    setAuthCookies(res, this.config, tokens);

    return { user };
  }
}
