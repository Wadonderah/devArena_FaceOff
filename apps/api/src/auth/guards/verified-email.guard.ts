import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/decorators';

/// Applied to competition participation and submission routes. Registration and
/// sign-in stay reachable so an unverified user can still recover their account.
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (!request.user?.emailVerified) {
      throw new ForbiddenException('Verify your email address to take part in the competition.');
    }

    return true;
  }
}
