import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../../config/config.service';
import type { AuthenticatedUser } from '../../common/decorators';

/// Applied to competition participation and submission routes. Registration and
/// sign-in stay reachable so an unverified user can still recover their account.
///
/// AUTH_SKIP_EMAIL_VERIFICATION disables the check for local development. The env
/// schema refuses that flag when NODE_ENV=production, so this bypass cannot reach
/// a real competition.
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get('AUTH_SKIP_EMAIL_VERIFICATION')) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (!request.user?.emailVerified) {
      throw new ForbiddenException('Verify your email address to take part in the competition.');
    }

    return true;
  }
}
