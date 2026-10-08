import { Injectable, type ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
    if (req.user?.id) return `user:${req.user.id}`;
    if (req.ip) return `ip:${req.ip}`;

    // The old fallback was the literal 'unknown', which is a single shared
    // bucket: every caller Express could not resolve an address for counted
    // against the same limit, so a handful of them could lock each other out
    // for reasons none of them could see. A per-request value cannot be
    // rate-limited collectively, which is the safer failure — the request still
    // passes through every other guard, and an address-less caller is rare
    // enough that the lost protection is not worth the shared lockout.
    //
    // Prefixes also keep the namespaces apart: without them a user whose id
    // happened to equal an IP string would share that IP's bucket.
    return `unresolved:${randomUUID()}`;
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
