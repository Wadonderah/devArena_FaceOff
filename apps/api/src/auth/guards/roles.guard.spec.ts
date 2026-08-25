import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function guardWith(metadata: { isPublic?: boolean; roles?: Role[] }) {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) =>
      key === 'isPublic' ? metadata.isPublic : metadata.roles,
    );
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows public routes without a user', () => {
    expect(guardWith({ isPublic: true }).canActivate(contextFor(undefined))).toBe(true);
  });

  it('allows routes that declare no roles', () => {
    const user = { id: 'u1', role: Role.PARTICIPANT };
    expect(guardWith({ roles: undefined }).canActivate(contextFor(user))).toBe(true);
  });

  it('allows a user whose role matches', () => {
    const user = { id: 'u1', role: Role.ORGANIZER };
    expect(guardWith({ roles: [Role.ORGANIZER] }).canActivate(contextFor(user))).toBe(true);
  });

  it('rejects a participant reaching an organizer route', () => {
    const user = { id: 'u1', role: Role.PARTICIPANT };
    expect(() => guardWith({ roles: [Role.ORGANIZER] }).canActivate(contextFor(user))).toThrow(
      ForbiddenException,
    );
  });

  it('treats ADMIN as a superset of ORGANIZER', () => {
    const user = { id: 'u1', role: Role.ADMIN };
    expect(guardWith({ roles: [Role.ORGANIZER] }).canActivate(contextFor(user))).toBe(true);
  });

  it('rejects an organizer reaching an admin-only route', () => {
    const user = { id: 'u1', role: Role.ORGANIZER };
    expect(() => guardWith({ roles: [Role.ADMIN] }).canActivate(contextFor(user))).toThrow(
      ForbiddenException,
    );
  });

  it('fails closed when a protected route has no authenticated user', () => {
    expect(() => guardWith({ roles: [Role.PARTICIPANT] }).canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
