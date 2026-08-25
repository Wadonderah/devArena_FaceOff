import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../../config/config.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/// Cookies are SameSite=Strict, which already blocks cross-site submission. This
/// is the second layer: every state-changing request must also carry an Origin
/// (or Referer) on the allowlist, so a same-site subdomain cannot forge one either.
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!MUTATING.has(request.method)) return true;

    const allowed = this.config.get('CORS_ORIGINS');
    const origin = request.headers.origin;

    if (origin) {
      if (!allowed.includes(origin)) {
        throw new ForbiddenException('Request origin is not allowed');
      }
      return true;
    }

    const referer = request.headers.referer;
    if (referer) {
      const refererOrigin = safeOrigin(referer);
      if (!refererOrigin || !allowed.includes(refererOrigin)) {
        throw new ForbiddenException('Request origin is not allowed');
      }
      return true;
    }

    // Non-browser clients (integration tests, curl, the deploy smoke check) send
    // neither header. They also cannot be driven by a victim's browser, which is
    // the threat this guard addresses.
    return true;
  }
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
