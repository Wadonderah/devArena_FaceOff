import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionState, Prisma } from '@prisma/client';
import { TeamsService } from './teams.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';

const COMPETITION = { id: 'comp-1', state: CompetitionState.REGISTRATION, maxTeamSize: null };

interface Overrides {
  competition?: unknown;
  profile?: unknown;
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
    // Read by the join hook to name the new member in the captain's
    // notification. Absent is a valid state — a profile is optional.
    profile: {
      findUnique: jest
        .fn()
        .mockResolvedValue('profile' in over ? over.profile : { displayName: 'Ada Lovelace' }),
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
      // Every team belongs to a competition; membership changes read its state.
      findUnique: jest.fn().mockResolvedValue(
        'team' in over && over.team
          ? { competition: { state: COMPETITION.state }, ...(over.team as object) }
          : null,
      ),
      findMany: jest.fn().mockResolvedValue([]),
      create: teamCreate,
      update: teamUpdate,
      delete: teamDelete,
    },
  } as unknown as PrismaService;

  // Joining by code now notifies the captain. Stubbed rather than mocked at the
  // Prisma layer so a test can assert who was told, not just that a row moved.
  const notifications = {
    notifyUser: jest.fn().mockResolvedValue(1),
  } as unknown as NotificationsService;

  return {
    service: new TeamsService(prisma, notifications),
    notifications,
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

describe('TeamsService.disband', () => {
  const team = { id: 'team-1', captainId: 'captain-1' };

  it('lets the captain delete a team that still has members', async () => {
    // The gap this closes: previously a captain had to remove every member one
    // at a time before they were allowed to leave.
    const { service, teamDelete, prisma } = build({ team });
    (prisma.teamMember.count as jest.Mock).mockResolvedValue(3);

    const result = await service.disband('team-1', 'captain-1');

    expect(teamDelete).toHaveBeenCalledWith({ where: { id: 'team-1' } });
    expect(result).toEqual({ disbanded: true, membersRemoved: 3 });
  });

  it('refuses a non-captain', async () => {
    const { service, teamDelete } = build({ team });

    await expect(service.disband('team-1', 'member-2')).rejects.toThrow(ForbiddenException);
    expect(teamDelete).not.toHaveBeenCalled();
  });

  it('rejects an unknown team', async () => {
    const { service } = build({ team: null });

    await expect(service.disband('missing', 'captain-1')).rejects.toThrow(NotFoundException);
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

describe('TeamsService.findOne — join code visibility', () => {
  // The code is a bearer credential. It was once returned to every caller, and
  // team ids are listable, so a rival could read any team's code and fill it.
  const TEAM = {
    id: 'team-1',
    name: 'Phoenix',
    code: 'ABC234',
    competitionId: 'comp-1',
    captainId: 'user-1',
    members: [{ userId: 'user-1' }, { userId: 'user-2' }],
  };

  it('returns the code to a member', async () => {
    const { service, prisma } = build();
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(TEAM);

    const team = await service.findOne('team-1', 'user-2');

    expect(team).toHaveProperty('code', 'ABC234');
  });

  it('omits the code entirely for a non-member', async () => {
    const { service, prisma } = build();
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(TEAM);

    const team = await service.findOne('team-1', 'rival-9');

    // Omitted, not nulled: the shape itself must not reveal that a code exists.
    expect(team).not.toHaveProperty('code');
    expect(team).toMatchObject({ id: 'team-1', name: 'Phoenix' });
  });

  it('still lists members for a non-member (names are not secret)', async () => {
    const { service, prisma } = build();
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(TEAM);

    const team = await service.findOne('team-1', 'rival-9');

    expect(team.members).toHaveLength(2);
  });
});

describe('TeamsService — membership is locked while the competition is live', () => {
  // Deleting a team nulls ScoreEvent.teamId, so a mid-round disband erases the
  // team from the standings. Joining and captaincy transfer stay open.
  const liveTeam = {
    id: 'team-1',
    competitionId: 'comp-1',
    captainId: 'user-1',
    competition: { state: CompetitionState.LIVE },
    _count: { members: 2 },
    members: [{ userId: 'user-1' }, { userId: 'user-2' }],
  };

  it('refuses leave', async () => {
    const { service } = build({ team: liveTeam, membership: { id: 'tm-2' } });
    await expect(service.leave('team-1', 'user-2')).rejects.toThrow(ForbiddenException);
    await expect(service.leave('team-1', 'user-2')).rejects.toThrow(/locked while/);
  });

  it('refuses disband', async () => {
    const { service, teamDelete } = build({ team: liveTeam });
    await expect(service.disband('team-1', 'user-1')).rejects.toThrow(ForbiddenException);
    expect(teamDelete).not.toHaveBeenCalled();
  });

  it('refuses removing a member', async () => {
    const { service, memberDelete } = build({ team: liveTeam, membership: { id: 'tm-2' } });
    await expect(service.removeMember('team-1', 'user-1', 'user-2')).rejects.toThrow(
      ForbiddenException,
    );
    expect(memberDelete).not.toHaveBeenCalled();
  });

  it('still allows captaincy transfer', async () => {
    const { service, teamUpdate } = build({ team: liveTeam, membership: { id: 'tm-2' } });
    await service.transferCaptaincy('team-1', 'user-1', 'user-2');
    expect(teamUpdate).toHaveBeenCalled();
  });
});

/// Joining by code is the one team change that happens without the captain
/// doing anything, so it is the only one they would otherwise discover solely
/// by reloading the page.
describe('TeamsService.joinByCode — captain notification', () => {
  const team = {
    id: 'team-1',
    competitionId: 'comp-1',
    name: 'Phoenix',
    captainId: 'captain-1',
    members: [],
  };

  it('tells the captain who joined', async () => {
    const { service, prisma, notifications } = build({ team });
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(team);

    await service.joinByCode('user-2', { code: 'ABC234' });

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      'captain-1',
      expect.objectContaining({
        type: 'TEAM_JOINED',
        title: 'Ada Lovelace joined Phoenix',
        linkUrl: '/teams/team-1',
      }),
    );
  });

  // A profile is optional. Falling back to the email address would put it in
  // front of the captain, and the team page they are being linked to does not
  // show member emails — the notification would leak more than its own target.
  it('falls back to a generic label rather than an email when there is no profile', async () => {
    const { service, prisma, notifications } = build({ team, profile: null });
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(team);

    await service.joinByCode('user-2', { code: 'ABC234' });

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      'captain-1',
      expect.objectContaining({ title: 'A new member joined Phoenix' }),
    );
  });

  it('does not notify a captain who is joining their own team', async () => {
    const { service, prisma, notifications } = build({ team });
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(team);

    await service.joinByCode('captain-1', { code: 'ABC234' });

    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  // The membership row has already committed by this point. Surfacing a
  // notification failure as an error would tell the participant their join
  // failed when in fact they are on the team.
  it('still reports a successful join when the notification fails', async () => {
    const { service, prisma, notifications, memberCreate } = build({ team });
    (prisma.team.findUnique as jest.Mock).mockResolvedValue(team);
    (notifications.notifyUser as jest.Mock).mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.joinByCode('user-2', { code: 'ABC234' })).resolves.toBeTruthy();
    expect(memberCreate).toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  // Nothing committed, so nobody should be told.
  it('does not notify when the join itself was rejected', async () => {
    const { service, notifications } = build({
      team,
      competition: { ...COMPETITION, maxTeamSize: 3 },
      memberCount: 3,
    });

    await expect(service.joinByCode('user-2', { code: 'ABC234' })).rejects.toThrow(/full/i);
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });
});
