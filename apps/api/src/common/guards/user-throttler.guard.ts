import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../decorators';

/// Authenticated traffic is tracked per user rather than per IP. Without this a
/// whole venue behind one NAT — exactly the pilot's setup — shares a single
/// bucket, and one participant's submissions would rate-limit everyone else.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request & { user?: AuthenticatedUser }): Promise<string> {
    return req.user?.id ?? req.ip ?? 'unknown';
  }
}
