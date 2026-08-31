import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { LeaderboardService } from '../leaderboard/leaderboard.service';
import type { AuditService } from '../audit/audit.service';

const CTX = { ip: '10.0.0.1', userAgent: 'jest' };

function build(target: unknown, otherSuperAdmins = 1) {
  const record = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockImplementation(({ data }) =>
    Promise.resolve({ id: 'target-1', email: 'target@example.com', ...data }),
  );

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(target),
      count: jest.fn().mockResolvedValue(otherSuperAdmins),
      update,
    },
  } as unknown as PrismaService;

  const service = new AdminService(
    prisma,
    {} as LeaderboardService,
    { record } as unknown as AuditService,
  );

  return { service, record, update };
}

const superAdmin = {
  id: 'target-1',
  email: 'target@example.com',
  role: Role.SUPER_ADMIN,
  isActive: true,
};
const participant = {
  id: 'target-1',
  email: 'target@example.com',
  role: Role.PARTICIPANT,
  isActive: true,
};

describe('AdminService.setUserRole', () => {
  it('promotes a participant to organizer', async () => {
    const { service, update } = build(participant);

    const result = await service.setUserRole('actor-1', 'target-1', Role.ORGANIZER, CTX);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: Role.ORGANIZER } }),
    );
    expect(result).toMatchObject({ role: Role.ORGANIZER, changed: true });
  });

  it('audits the change with both the old and new role', async () => {
    const { service, record } = build(participant);

    await service.setUserRole('actor-1', 'target-1', Role.ORGANIZER, CTX);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-1',
        action: 'admin.user.role_changed',
        entityId: 'target-1',
        metadata: expect.objectContaining({ from: Role.PARTICIPANT, to: Role.ORGANIZER }),
      }),
    );
  });

  it('is a no-op when the role already matches, and writes no audit noise', async () => {
    const { service, record, update } = build(participant);

    const result = await service.setUserRole('actor-1', 'target-1', Role.PARTICIPANT, CTX);

    expect(result).toMatchObject({ changed: false });
    expect(update).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('refuses to let a super admin demote themselves', async () => {
    // Self-demotion is irreversible: undoing it needs the privilege just given up.
    const { service } = build(superAdmin);

    await expect(
      service.setUserRole('target-1', 'target-1', Role.ORGANIZER, CTX),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses to demote the last super admin', async () => {
    const { service } = build(superAdmin, 0);

    await expect(
      service.setUserRole('actor-1', 'target-1', Role.ORGANIZER, CTX),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows demoting a super admin while another remains', async () => {
    const { service, update } = build(superAdmin, 1);

    await service.setUserRole('actor-1', 'target-1', Role.ORGANIZER, CTX);

    expect(update).toHaveBeenCalled();
  });

  it('rejects an unknown user', async () => {
    const { service } = build(null);

    await expect(
      service.setUserRole('actor-1', 'missing', Role.ORGANIZER, CTX),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('AdminService.setUserActive', () => {
  it('deactivates a participant and audits it', async () => {
    const { service, record, update } = build(participant);

    await service.setUserActive('actor-1', 'target-1', false, CTX);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.deactivated' }),
    );
  });

  it('refuses self-deactivation', async () => {
    const { service } = build(superAdmin);

    await expect(service.setUserActive('target-1', 'target-1', false, CTX)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses to deactivate the last active super admin', async () => {
    const { service } = build(superAdmin, 0);

    await expect(service.setUserActive('actor-1', 'target-1', false, CTX)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('records reactivation under a distinct action', async () => {
    const { service, record } = build({ ...participant, isActive: false });

    await service.setUserActive('actor-1', 'target-1', true, CTX);

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.reactivated' }),
    );
  });
});
