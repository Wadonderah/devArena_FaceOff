import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../decorators';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const STAFF = new Set<Role>([Role.ORGANIZER, Role.ADMIN]);

// Request bodies are recorded for traceability, so anything credential-shaped is
// stripped before it reaches the audit table.
const REDACTED = new Set(['password', 'token', 'passwordHash', 'sourceCode']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!MUTATING.has(request.method) || !user || !STAFF.has(user.role)) {
      return next.handle();
    }

    const controller = context.getClass().name.replace(/Controller$/, '');
    const action = `${controller}.${context.getHandler().name}`;

    return next.handle().pipe(
      // Only successful operations are recorded; a rejected request produced no
      // change worth auditing, and failures are already captured in error logs.
      tap(() => {
        void this.audit.record({
          actorId: user.id,
          action,
          entityType: controller,
          entityId: this.entityIdFrom(request),
          metadata: this.redact(request.body),
          ipAddress: request.ip ?? null,
          userAgent: request.headers['user-agent'] ?? null,
        });
      }),
    );
  }

  private entityIdFrom(request: Request): string | null {
    const params = request.params as Record<string, string>;
    return params.id ?? params.competitionId ?? params.roundId ?? null;
  }

  private redact(body: unknown): Prisma.InputJsonObject {
    if (!body || typeof body !== 'object') return {};

    return Object.fromEntries(
      Object.entries(body as Record<string, unknown>).map(([key, value]) => [
        key,
        REDACTED.has(key) ? '[redacted]' : (value as Prisma.InputJsonValue),
      ]),
    ) as Prisma.InputJsonObject;
  }
}
