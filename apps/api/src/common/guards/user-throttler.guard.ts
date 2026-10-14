import { Injectable, type ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../decorators';

/// Keyed per (IP, email), for public auth routes where there is no user yet.
/// IP alone would give a whole venue behind one NAT a single bucket. A looser
/// IP-only throttler on the same route still caps rotating emails.
export const ACCOUNT_THROTTLER = 'account';

/// Tracks authenticated traffic per user, not per IP: a venue behind one NAT
/// would otherwise let one participant rate-limit everybody else.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request & { user?: AuthenticatedUser }): Promise<string> {
    if (req.user?.id) return `user:${req.user.id}`;
    if (req.ip) return `ip:${req.ip}`;

    // Per-request, so address-less callers cannot collectively lock each other
    // out of a shared bucket. They still pass through every other guard.
    //
    // The prefixes matter: without them a user id equal to an IP string would
    // share that IP's bucket.
    return `unresolved:${randomUUID()}`;
  }

  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    if (name !== ACCOUNT_THROTTLER) return super.generateKey(context, suffix, name);

    const req = context.switchToHttp().getRequest<Request>();
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    // Lower-cased to match the DTO, so `Ama@…` and `ama@…` share a bucket.
    return super.generateKey(context, `${suffix}:${email}`, name);
  }
}
