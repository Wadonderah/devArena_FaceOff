import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, ROLES_KEY, type AuthenticatedUser } from '../../common/decorators';

/// The single source of truth for role precedence:
/// PARTICIPANT < ORGANIZER < SUPER_ADMIN.
export const ROLE_RANK: Record<Role, number> = {
  [Role.PARTICIPANT]: 0,
  [Role.ORGANIZER]: 1,
  [Role.SUPER_ADMIN]: 2,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) throw new ForbiddenException('Insufficient permissions');

    // A role satisfies a requirement if it ranks at or above it. Declaring the
    // order once here beats scattering `role === ADMIN` superset checks across
    // call sites, where one omission silently becomes a privilege gap.
    const held = ROLE_RANK[user.role];
    const permitted = required.some((role) => held >= ROLE_RANK[role]);

    if (!permitted) throw new ForbiddenException('Insufficient permissions');

    return true;
  }
}
