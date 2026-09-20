import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../decorators';

/// The named throttler that is keyed per (IP, email) rather than per IP.
///
/// Public auth routes cannot key by user — there is no user yet — and keying
/// them by IP alone meant a whole venue behind one NAT shared one bucket: the
/// sixth person to sign in within fifteen minutes was refused. Keying by
/// IP + email gives each account its own bucket at that IP, while a second,
/// looser IP-only throttler on the same route still caps an attacker who
/// rotates emails from one address.
export const ACCOUNT_THROTTLER = 'account';

/// Authenticated traffic is tracked per user rather than per IP. Without this a
/// whole venue behind one NAT — exactly the pilot's setup — shares a single
/// bucket, and one participant's submissions would rate-limit everyone else.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request & { user?: AuthenticatedUser }): Promise<string> {
    return req.user?.id ?? req.ip ?? 'unknown';
  }

  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    if (name !== ACCOUNT_THROTTLER) return super.generateKey(context, suffix, name);

    const req = context.switchToHttp().getRequest<Request>();
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    // Lower-cased so `Ama@…` and `ama@…` share a bucket — the DTO normalises the
    // same way, so this matches what the account lookup will see.
    return super.generateKey(context, `${suffix}:${email}`, name);
  }
}
