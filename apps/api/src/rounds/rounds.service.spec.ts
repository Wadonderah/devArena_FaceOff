import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, RoundState, RoundType } from '@prisma/client';
import { RoundsService } from './rounds.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';

/// RoundsService now fans out ROUND_STARTED / ROUND_ENDED on transition. None
/// of the tests below exercise `transition`, so a stub that records calls is
/// enough — and it keeps the one assertion that matters available: that the
/// paths under test never notify anyone.
const makeService = (prisma: PrismaService) =>
  new RoundsService(prisma, {
    notifyCompetition: jest.fn().mockResolvedValue(0),
  } as unknown as NotificationsService);

function makePrisma(stored: { id: string; state: RoundState } | null) {
  const round = {
    findUnique: jest.fn().mockResolvedValue(stored),
    delete: jest.fn().mockResolvedValue({}),
  };
  return { prisma: { round } as unknown as PrismaService, round };
}

describe('RoundsService.remove', () => {
  // These two cannot have accepted a submission, so nothing a participant
  // produced is destroyed.
  it.each([RoundState.DRAFT, RoundState.SCHEDULED])('deletes a round in %s', async (state) => {
    const { prisma, round } = makePrisma({ id: 'r1', state });

    await makeService(prisma).remove('r1');

    expect(round.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('rejects an unknown round', async () => {
    const { prisma, round } = makePrisma(null);

    await expect(makeService(prisma).remove('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(round.delete).not.toHaveBeenCalled();
  });

  // From LIVE onward a round may own submissions, MCQ attempts and score
  // events, all of which cascade. Deleting one would silently take a
  // participant's recorded work and their standing with it.
  it.each([
    RoundState.LIVE,
    RoundState.PAUSED,
    RoundState.COMPLETED,
    RoundState.FINALIZED,
    RoundState.ARCHIVED,
  ])('refuses to delete a round in %s and suggests archiving', async (state) => {
    const { prisma, round } = makePrisma({ id: 'r1', state });
    const service = makeService(prisma);

    await expect(service.remove('r1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('r1')).rejects.toThrow(/Archive it instead/);
    expect(round.delete).not.toHaveBeenCalled();
  });
});

const dec = (n: number) => new Prisma.Decimal(n);

/// Prisma double with a round, its siblings and its recorded scores.
function makeWeightPrisma(opts: {
  state: RoundState;
  weight: number;
  siblingWeights: number[];
  events?: { id: string; rawScore: number; maxRawScore: number }[];
  /// Points per challenge in the round. The SUM is the denominator.
  challengePoints?: number[];
}) {
  type Captured = { where: { id: string }; data: { roundWeight: unknown; weightedScore: unknown } };
  const updated: Captured[] = [];

  const tx = {
    scoreEvent: {
      findMany: jest.fn().mockResolvedValue(
        (opts.events ?? []).map((e) => ({
          id: e.id,
          rawScore: dec(e.rawScore),
          maxRawScore: dec(e.maxRawScore),
        })),
      ),
      update: jest.fn().mockImplementation((args: Captured) => {
        updated.push(args);
        return Promise.resolve({});
      }),
    },
    round: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    round: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'r1',
        competitionId: 'c1',
        state: opts.state,
        weight: dec(opts.weight),
        startsAt: null,
        endsAt: null,
        type: 'MCQ',
      }),
      findMany: jest.fn().mockResolvedValue(opts.siblingWeights.map((w) => ({ weight: dec(w) }))),
    },
    // The round's challenges, whose points sum to the denominator.
    roundChallenge: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (opts.challengePoints ?? [20]).map((points) => ({ challenge: { points } })),
        ),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  return { prisma, tx, updated };
}

describe('RoundsService.setWeight', () => {
  // Regression. A round's weight is its share of the whole competition, so the
  // events in it must sum to exactly that weight and never more.
  //
  // The first version of this method reused each row's `maxRawScore` as the
  // denominator. That field is the CHALLENGE's maximum, not the round's, so with
  // two 20-point challenges in one round every event was divided by 20 instead
  // of 40 and scored double. A 0.4-weight round contributed 0.8 to the final
  // standings. The original tests all used a single challenge, where the two
  // numbers coincide — which is precisely why they passed.
  it('divides by the round total, not the challenge total', async () => {
    const { prisma, updated } = makeWeightPrisma({
      state: RoundState.LIVE,
      weight: 0.6,
      siblingWeights: [],
      challengePoints: [20, 20], // round max = 40
      events: [
        { id: 'e1', rawScore: 20, maxRawScore: 20 },
        { id: 'e2', rawScore: 20, maxRawScore: 20 },
      ],
    });

    await makeService(prisma).setWeight('r1', 0.4);

    // 20/40 * 0.4 = 0.2 each...
    expect(Number(updated[0].data.weightedScore)).toBeCloseTo(0.2, 6);
    expect(Number(updated[1].data.weightedScore)).toBeCloseTo(0.2, 6);

    // ...so the round contributes exactly its weight, not twice it.
    const total = updated.reduce((sum, u) => sum + Number(u.data.weightedScore), 0);
    expect(total).toBeCloseTo(0.4, 6);
  });

  it('never lets a round contribute more than its weight, whatever the split', async () => {
    const { prisma, updated } = makeWeightPrisma({
      state: RoundState.LIVE,
      weight: 0.5,
      siblingWeights: [],
      challengePoints: [10, 30, 60], // round max = 100
      events: [
        { id: 'e1', rawScore: 10, maxRawScore: 10 },
        { id: 'e2', rawScore: 30, maxRawScore: 30 },
        { id: 'e3', rawScore: 60, maxRawScore: 60 },
      ],
    });

    await makeService(prisma).setWeight('r1', 0.5);

    const total = updated.reduce((sum, u) => sum + Number(u.data.weightedScore), 0);
    expect(total).toBeCloseTo(0.5, 6);
  });

  it('rewrites every recorded score so the leaderboard stays consistent', async () => {
    // weightedScore = rawScore / maxRawScore * weight
    const { prisma, tx, updated } = makeWeightPrisma({
      state: RoundState.LIVE,
      weight: 0.6,
      siblingWeights: [0.4],
      events: [
        { id: 'e1', rawScore: 10, maxRawScore: 20 },
        { id: 'e2', rawScore: 20, maxRawScore: 20 },
      ],
    });

    await makeService(prisma).setWeight('r1', 0.3);

    expect(updated).toHaveLength(2);
    // 10/20 * 0.3 = 0.15
    expect(Number(updated[0].data.weightedScore)).toBeCloseTo(0.15, 6);
    expect(Number(updated[0].data.roundWeight)).toBeCloseTo(0.3, 6);
    // 20/20 * 0.3 = 0.30
    expect(Number(updated[1].data.weightedScore)).toBeCloseTo(0.3, 6);

    expect(tx.round.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { weight: expect.anything() },
    });
  });

  // The round row and its score events must never disagree, so both writes go
  // through the same transaction callback.
  it('updates the scores and the round in one transaction', async () => {
    const { prisma } = makeWeightPrisma({
      state: RoundState.LIVE,
      weight: 0.6,
      siblingWeights: [0.4],
      events: [{ id: 'e1', rawScore: 5, maxRawScore: 10 }],
    });

    await makeService(prisma).setWeight('r1', 0.3);

    expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(1);
  });

  it('still enforces the 1.0 budget, counting siblings', async () => {
    const { prisma } = makeWeightPrisma({
      state: RoundState.LIVE,
      weight: 0.6,
      siblingWeights: [0.4],
    });

    // 0.4 sibling + 0.7 requested = 1.1
    await expect(makeService(prisma).setWeight('r1', 0.7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('names the remaining budget rather than just the rejected total', async () => {
    const { prisma } = makeWeightPrisma({
      state: RoundState.LIVE,
      weight: 0.6,
      siblingWeights: [0.4],
    });

    await expect(makeService(prisma).setWeight('r1', 0.7)).rejects.toThrow(
      /leaving 0\.6000/,
    );
  });

  // Finalizing is what makes a published result trustworthy; reweighting a
  // locked round would change it after the fact.
  it.each([RoundState.FINALIZED, RoundState.ARCHIVED])(
    'refuses to reweight a %s round',
    async (state) => {
      const { prisma, tx } = makeWeightPrisma({ state, weight: 0.4, siblingWeights: [0.6] });

      await expect(makeService(prisma).setWeight('r1', 0.2)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.round.update).not.toHaveBeenCalled();
    },
  );

  it.each([RoundState.DRAFT, RoundState.SCHEDULED, RoundState.LIVE, RoundState.PAUSED, RoundState.COMPLETED])(
    'allows reweighting a %s round',
    async (state) => {
      const { prisma, tx } = makeWeightPrisma({ state, weight: 0.4, siblingWeights: [0.2] });

      await makeService(prisma).setWeight('r1', 0.3);

      expect(tx.round.update).toHaveBeenCalled();
    },
  );
});

/// Round transitions are the only fan-out that reaches every participant at
/// once, and the only one triggered by a human pressing a button mid-event.
describe('RoundsService.transition — participant notifications', () => {
  const round = {
    id: 'r1',
    name: 'Bug Hunt',
    type: RoundType.DEBUGGING,
    competitionId: 'c1',
    // Widened, so an override can supply any state. Left as the literal it
    // would otherwise infer, every test below could only ever pass SCHEDULED.
    state: RoundState.SCHEDULED as RoundState,
    startsAt: null,
    endsAt: null,
  };

  function build(stored: Partial<typeof round> = {}) {
    const notifications = {
      notifyCompetition: jest.fn().mockResolvedValue(2),
    } as unknown as NotificationsService;

    const prisma = {
      round: {
        findUnique: jest.fn().mockResolvedValue({ ...round, ...stored }),
        update: jest.fn().mockResolvedValue({ ...round, ...stored }),
      },
      roundChallenge: { count: jest.fn().mockResolvedValue(3) },
      competition: { findUnique: jest.fn().mockResolvedValue({ name: 'Season 1' }) },
    } as unknown as PrismaService;

    return { service: new RoundsService(prisma, notifications), prisma, notifications };
  }

  it('announces a round that goes live, naming the competition', async () => {
    const { service, notifications } = build();

    await service.transition('r1', RoundState.LIVE);

    expect(notifications.notifyCompetition).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        type: 'ROUND_STARTED',
        title: 'Bug Hunt is open',
        linkUrl: '/rounds/r1/debugging',
        dedupeKey: 'round:r1:started',
      }),
    );
  });

  it('announces a round that completes, pointing at the standings', async () => {
    const { service, notifications } = build({ state: RoundState.LIVE });

    await service.transition('r1', RoundState.COMPLETED);

    expect(notifications.notifyCompetition).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        type: 'ROUND_ENDED',
        linkUrl: '/leaderboard/c1',
        dedupeKey: 'round:r1:ended',
      }),
    );
  });

  // Pausing is not an ending. A fire alarm or a failing projector is why PAUSED
  // exists, and telling fifty people the round is over when it is about to
  // resume would be worse than saying nothing.
  it('says nothing when a round is paused', async () => {
    const { service, notifications } = build({ state: RoundState.LIVE });

    await service.transition('r1', RoundState.PAUSED);

    expect(notifications.notifyCompetition).not.toHaveBeenCalled();
  });

  // Both are bookkeeping that happen after participants were already told the
  // round closed. FINALIZED in particular is reachable twice, because an
  // organizer may unlock to correct a score and finalize again.
  it.each([RoundState.FINALIZED, RoundState.ARCHIVED])(
    'says nothing when a round moves to %s',
    async (to) => {
      const { service, notifications } = build({ state: RoundState.COMPLETED });

      await service.transition('r1', to);

      expect(notifications.notifyCompetition).not.toHaveBeenCalled();
    },
  );

  // The transition is the organizer's instruction; the notification is a side
  // effect of it. If the fan-out could fail the transition, an unrelated
  // database blip would stop a round being started at all.
  it('starts the round even when the fan-out throws', async () => {
    const { service, prisma, notifications } = build();
    (notifications.notifyCompetition as jest.Mock).mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.transition('r1', RoundState.LIVE)).resolves.toBeTruthy();
    expect(prisma.round.update).toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  // Same reasoning, one layer earlier: the competition name is read here,
  // outside the notification service's own guard.
  it('starts the round even when the competition lookup throws', async () => {
    const { service, prisma } = build();
    (prisma.competition.findUnique as jest.Mock).mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.transition('r1', RoundState.LIVE)).resolves.toBeTruthy();
    expect(prisma.round.update).toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  // Nothing was written, so nobody should be told. The guard that blocks an
  // empty round from starting runs before the update.
  it('does not announce a transition it refused', async () => {
    const { service, notifications, prisma } = build();
    (prisma.roundChallenge.count as jest.Mock).mockResolvedValue(0);

    await expect(service.transition('r1', RoundState.LIVE)).rejects.toThrow(
      /at least one challenge/i,
    );
    expect(notifications.notifyCompetition).not.toHaveBeenCalled();
  });
});
