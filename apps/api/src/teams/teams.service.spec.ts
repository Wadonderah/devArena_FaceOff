import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionState, Prisma } from '@prisma/client';
import { TeamsService } from './teams.service';
import type { PrismaService } from '../prisma/prisma.service';

const COMPETITION = { id: 'comp-1', state: CompetitionState.REGISTRATION, maxTeamSize: null };

interface Overrides {
  competition?: unknown;
  enrolled?: unknown;
  existingMembership?: unknown;
  team?: unknown;
  membership?: unknown;
  memberCount?: number;
}

function build(over: Overrides = {}) {
  const teamCreate = jest.fn().mockResolvedValue({ id: 'team-1', code: 'ABC234' });
  const memberCreate = jest.fn().mockResolvedValue({ id: 'tm-1' });
  const memberDelete = jest.fn().mockResolvedValue({});
  const teamUpdate = jest.fn().mockResolvedValue({});
  const teamDelete = jest.fn().mockResolvedValue({});

  const prisma = {
    competition: {
      findUnique: jest.fn().mockResolvedValue(
        'competition' in over ? over.competition : COMPETITION,
      ),
    },
    competitionParticipant: {
      findUnique: jest
        .fn()
        .mockResolvedValue('enrolled' in over ? over.enrolled : { id: 'cp-1' }),
    },
    teamMember: {
      findUnique: jest
        .fn()
        .mockResolvedValue('membership' in over ? over.membership : over.existingMembership ?? null),
      create: memberCreate,
      delete: memberDelete,
      count: jest.fn().mockResolvedValue(over.memberCount ?? 1),
    },
    team: {
      findUnique: jest.fn().mockResolvedValue('team' in over ? over.team : null),
      findMany: jest.fn().mockResolvedValue([]),
      create: teamCreate,
      update: teamUpdate,
      delete: teamDelete,
    },
  } as unknown as PrismaService;

  return {
    service: new TeamsService(prisma),
    prisma,
    teamCreate,
    memberCreate,
    memberDelete,
    teamUpdate,
    teamDelete,
  };
}

const conflict = (target: string[]) =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: '6',
    meta: { target },
  });

describe('TeamsService.create', () => {
  it('makes the creator both captain and first member', async () => {
    const { service, teamCreate } = build();

    await service.create('comp-1', 'user-1', { name: 'Team Phoenix' });

    const data = teamCreate.mock.calls[0][0].data;
    expect(data.captainId).toBe('user-1');
    expect(data.members.create).toMatchObject({ userId: 'user-1', competitionId: 'comp-1' });
  });

  it('refuses when the participant has not joined the competition', async () => {
    const { service } = build({ enrolled: null });

    await expect(service.create('comp-1', 'user-1', { name: 'X' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a second team in the same competition', async () => {
    const { service } = build({ existingMembership: { teamId: 'team-9' } });

    await expect(service.create('comp-1', 'user-1', { name: 'X' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses once the competition has finished', async () => {
    const { service } = build({
      competition: { ...COMPETITION, state: CompetitionState.COMPLETED },
    });

    await expect(service.create('comp-1', 'user-1', { name: 'X' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('hides a draft competition', async () => {
    const { service } = build({
      competition: { ...COMPETITION, state: CompetitionState.DRAFT },
    });

    await expect(service.create('comp-1', 'user-1', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('retries with a fresh code when one collides', async () => {
    const { service, teamCreate } = build();
    teamCreate
      .mockRejectedValueOnce(conflict(['code']))
      .mockResolvedValueOnce({ id: 'team-1', code: 'XYZ789' });

    await service.create('comp-1', 'user-1', { name: 'Team Phoenix' });

    expect(teamCreate).toHaveBeenCalledTimes(2);
    const first = teamCreate.mock.calls[0][0].data.code;
    const second = teamCreate.mock.calls[1][0].data.code;
    expect(first).not.toBe(second);
  });

  it('does not swallow an unrelated unique violation as a code collision', async () => {
    const { service, teamCreate } = build();
    teamCreate.mockRejectedValue(conflict(['competitionId', 'name']));

    await expect(service.create('comp-1', 'user-1', { name: 'Dupe' })).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});

describe('TeamsService.joinByCode', () => {
  it('accepts a code typed in lower case with spaces', async () => {
    const { service, prisma, memberCreate } = build({
      team: { id: 'team-1', competitionId: 'comp-1', name: 'Phoenix' },
    });
    // findOne at the end needs a team shape too
    (prisma.team.findUnique as jest.Mock).mockResolvedValue({
      id: 'team-1',
      competitionId: 'comp-1',
      name: 'Phoenix',
      members: [],
    });

    await service.joinByCode('user-2', { code: 'abc 234' });

    expect((prisma.team.findUnique as jest.Mock).mock.calls[0][0].where.code).toBe('ABC234');
    expect(memberCreate).toHaveBeenCalled();
  });

  it('reports an unknown code clearly', async () => {
    const { service } = build({ team: null });

    await expect(service.joinByCode('user-2', { code: 'NOPE12' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses to exceed the competition team size cap', async () => {
    const { service } = build({
      team: { id: 'team-1', competitionId: 'comp-1', name: 'Phoenix' },
      competition: { ...COMPETITION, maxTeamSize: 3 },
      memberCount: 3,
    });

    await expect(service.joinByCode('user-2', { code: 'ABC234' })).rejects.toThrow(
      /team is full/i,
    );
  });

  it('turns a concurrent double-join into a clean conflict', async () => {
    const { service, memberCreate } = build({
      team: { id: 'team-1', competitionId: 'comp-1', name: 'Phoenix' },
    });
    memberCreate.mockRejectedValue(conflict(['competitionId', 'userId']));

    await expect(service.joinByCode('user-2', { code: 'ABC234' })).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('TeamsService captaincy', () => {
  const team = { id: 'team-1', captainId: 'captain-1' };

  it('lets only the captain remove a member', async () => {
    const { service } = build({ team });

    await expect(service.removeMember('team-1', 'member-2', 'member-3')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('stops the captain removing themselves', async () => {
    const { service } = build({ team });

    await expect(service.removeMember('team-1', 'captain-1', 'captain-1')).rejects.toThrow(
      /transfer captaincy/i,
    );
  });

  it('lets only the captain transfer captaincy', async () => {
    const { service } = build({ team });

    await expect(
      service.transferCaptaincy('team-1', 'member-2', 'member-3'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses to hand captaincy to a non-member', async () => {
    const { service } = build({ team, membership: null });

    await expect(
      service.transferCaptaincy('team-1', 'captain-1', 'outsider'),
    ).rejects.toThrow(BadRequestException);
  });

  it('transfers captaincy to an existing member', async () => {
    const { service, teamUpdate, prisma } = build({ team });
    (prisma.teamMember.findUnique as jest.Mock).mockResolvedValue({ id: 'tm-2' });
    (prisma.team.findUnique as jest.Mock)
      .mockResolvedValueOnce(team)
      .mockResolvedValue({ id: 'team-1', members: [] });

    await service.transferCaptaincy('team-1', 'captain-1', 'member-2');

    expect(teamUpdate).toHaveBeenCalledWith({
      where: { id: 'team-1' },
      data: { captainId: 'member-2' },
    });
  });
});

describe('TeamsService.leave', () => {
  it('blocks a captain from abandoning a team that still has members', async () => {
    const { service } = build({
      team: { id: 'team-1', captainId: 'captain-1', _count: { members: 3 } },
    });

    await expect(service.leave('team-1', 'captain-1')).rejects.toThrow(/transfer captaincy/i);
  });

  it('disbands the team when the last member leaves', async () => {
    const { service, teamDelete } = build({
      team: { id: 'team-1', captainId: 'captain-1', _count: { members: 1 } },
      membership: { id: 'tm-1' },
    });

    const result = await service.leave('team-1', 'captain-1');

    expect(teamDelete).toHaveBeenCalledWith({ where: { id: 'team-1' } });
    expect(result).toEqual({ left: true, disbanded: true });
  });

  it('removes a non-captain member without disbanding', async () => {
    const { service, memberDelete, teamDelete } = build({
      team: { id: 'team-1', captainId: 'captain-1', _count: { members: 3 } },
      membership: { id: 'tm-2' },
    });

    const result = await service.leave('team-1', 'member-2');

    expect(memberDelete).toHaveBeenCalledWith({ where: { id: 'tm-2' } });
    expect(teamDelete).not.toHaveBeenCalled();
    expect(result).toEqual({ left: true, disbanded: false });
  });
});
