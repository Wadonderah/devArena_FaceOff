import { ConflictException, NotFoundException } from '@nestjs/common';
import { CompetitionState } from '@prisma/client';
import { CompetitionsService } from './competitions.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';

/// CompetitionsService announces to the whole platform when a competition opens
/// for registration. None of the delete tests touch that path, so a stub is
/// enough — and it keeps the useful assertion available: that they never
/// notify anyone.
const makeService = (prisma: PrismaService) =>
  new CompetitionsService(prisma, {
    notifyAllUsers: jest.fn().mockResolvedValue(0),
  } as unknown as NotificationsService);

function makePrisma(stored: { id: string; state: CompetitionState } | null) {
  const competition = {
    findUnique: jest.fn().mockResolvedValue(stored),
    delete: jest.fn().mockResolvedValue({}),
  };
  return { prisma: { competition } as unknown as PrismaService, competition };
}

describe('CompetitionsService.remove', () => {
  it('deletes a competition that is still a draft', async () => {
    const { prisma, competition } = makePrisma({ id: 'c1', state: CompetitionState.DRAFT });

    await makeService(prisma).remove('c1');

    expect(competition.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('rejects an unknown competition', async () => {
    const { prisma, competition } = makePrisma(null);

    await expect(makeService(prisma).remove('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(competition.delete).not.toHaveBeenCalled();
  });

  // The whole point of the restriction: anything past DRAFT may own rounds,
  // submissions and score events, and deleting it would destroy a participant's
  // recorded work with no undo.
  it.each([
    CompetitionState.REGISTRATION,
    CompetitionState.LIVE,
    CompetitionState.COMPLETED,
    CompetitionState.ARCHIVED,
  ])('refuses to delete a competition in %s and suggests archiving', async (state) => {
    const { prisma, competition } = makePrisma({ id: 'c1', state });
    const service = makeService(prisma);

    await expect(service.remove('c1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('c1')).rejects.toThrow(/Archive this one instead/);
    expect(competition.delete).not.toHaveBeenCalled();
  });

  // The guard lives in the service, not the controller or the UI, so a direct
  // API call cannot route around a hidden button.
  it('enforces the rule without consulting the caller', async () => {
    const { prisma } = makePrisma({ id: 'c1', state: CompetitionState.LIVE });

    await expect(makeService(prisma).remove('c1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

/// The only notification that goes to the whole platform rather than to a
/// competition's participants — it has to, because at the moment it fires there
/// are none.
describe('CompetitionsService.update — registration opening', () => {
  function build(storedState: CompetitionState) {
    const notifications = {
      notifyAllUsers: jest.fn().mockResolvedValue(7),
    } as unknown as NotificationsService;

    const stored = { id: 'c1', name: 'Season 1', state: storedState };
    const prisma = {
      competition: {
        findUnique: jest.fn().mockResolvedValue(stored),
        update: jest.fn().mockResolvedValue({ ...stored, state: CompetitionState.REGISTRATION }),
      },
    } as unknown as PrismaService;

    return { service: new CompetitionsService(prisma, notifications), prisma, notifications };
  }

  it('announces to everyone when a draft opens for registration', async () => {
    const { service, notifications } = build(CompetitionState.DRAFT);

    await service.update('c1', { state: CompetitionState.REGISTRATION }, 'organizer-1');

    expect(notifications.notifyAllUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'COMPETITION_OPEN',
        title: 'Season 1 is open for registration',
        linkUrl: '/competitions/c1',
        dedupeKey: 'competition:c1:registration-open',
      }),
      expect.objectContaining({
        exceptUserId: 'organizer-1',
        excludeParticipantsOf: 'c1',
      }),
    );
  });

  // An organizer editing the name of a competition that is already open sends
  // `state: 'REGISTRATION'` with every PATCH. Without comparing against the
  // stored state, each of those would be an opening announcement.
  it('stays silent when the competition was already open', async () => {
    const { service, notifications } = build(CompetitionState.REGISTRATION);

    await service.update('c1', { state: CompetitionState.REGISTRATION, name: 'Renamed' }, 'o1');

    expect(notifications.notifyAllUsers).not.toHaveBeenCalled();
  });

  it('stays silent for an edit that does not touch the state', async () => {
    const { service, notifications } = build(CompetitionState.DRAFT);

    await service.update('c1', { name: 'Just a rename' }, 'o1');

    expect(notifications.notifyAllUsers).not.toHaveBeenCalled();
  });

  // Going live is a different event, and currently an unannounced one.
  it.each([CompetitionState.LIVE, CompetitionState.COMPLETED, CompetitionState.ARCHIVED])(
    'stays silent when moving to %s',
    async (state) => {
      const { service, notifications } = build(CompetitionState.REGISTRATION);

      await service.update('c1', { state }, 'o1');

      expect(notifications.notifyAllUsers).not.toHaveBeenCalled();
    },
  );

  // Opening registration is the organizer's instruction. A fan-out failure must
  // not undo it or surface as an error.
  it('still opens registration when the fan-out throws', async () => {
    const { service, prisma, notifications } = build(CompetitionState.DRAFT);
    (notifications.notifyAllUsers as jest.Mock).mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      service.update('c1', { state: CompetitionState.REGISTRATION }, 'o1'),
    ).resolves.toBeTruthy();
    expect(prisma.competition.update).toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  // The parameter exists only to keep the organizer out of their own
  // announcement, so its absence must not break the announcement.
  it('announces even without an actor', async () => {
    const { service, notifications } = build(CompetitionState.DRAFT);

    await service.update('c1', { state: CompetitionState.REGISTRATION });

    expect(notifications.notifyAllUsers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ exceptUserId: undefined }),
    );
  });
});
