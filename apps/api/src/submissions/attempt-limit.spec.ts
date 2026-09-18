import { ForbiddenException } from '@nestjs/common';
import { Language, ParticipationMode, Prisma, RoundState, RoundType } from '@prisma/client';
import { CodeService } from './code.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RoundsService } from '../rounds/rounds.service';
import type { Judge0Client } from '../execution/judge0.client';
import type { ExecutionQueue } from '../execution/execution.queue';

/// `Round.attemptLimit` was persisted and read for a while before anything
/// enforced it — the column existed, the organizer could set it, and every
/// submission sailed past. These tests exist so it cannot silently go dead again.

const testCase = {
  id: 'tc-1',
  stdin: '1',
  expectedOutput: '1',
  isHidden: true,
  weight: 1,
};

function buildService(attemptLimit: number | null, submissionsUsed: number) {
  const round = {
    id: 'round-1',
    competitionId: 'comp-1',
    type: RoundType.CODING,
    state: RoundState.LIVE,
    startsAt: new Date(Date.now() - 60_000),
    endsAt: null,
    weight: new Prisma.Decimal(0.5),
    allowedLanguages: [Language.PYTHON],
    participationMode: ParticipationMode.INDIVIDUAL,
    negativeMarking: new Prisma.Decimal(0),
    attemptLimit,
  };

  const count = jest.fn().mockResolvedValue(submissionsUsed);
  const create = jest
    .fn()
    .mockResolvedValue({ id: 'sub-1', status: 'QUEUED', submittedAt: new Date() });

  const prisma = {
    competitionParticipant: { findUnique: jest.fn().mockResolvedValue({ id: 'cp-1' }) },
    teamMember: { findUnique: jest.fn().mockResolvedValue({ id: 'tm-1' }) },
    submission: { count, create },
    roundChallenge: {
      findUnique: jest.fn().mockResolvedValue({
        challenge: {
          id: 'challenge-1',
          title: 'Sum two numbers',
          points: 20,
          version: 1,
          debuggingChallenge: null,
          codingChallenge: {
            statement: 'Add them.',
            cpuTimeLimit: new Prisma.Decimal(2),
            wallTimeLimit: new Prisma.Decimal(6),
            memoryLimitKb: 128000,
            maxProcesses: 30,
            maxFileSizeKb: 1024,
            testCases: [testCase],
          },
        },
      }),
    },
  } as unknown as PrismaService;

  const rounds = {
    requireLiveRound: jest.fn().mockResolvedValue(round),
  } as unknown as RoundsService;

  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as ExecutionQueue;
  const judge0 = {} as unknown as Judge0Client;

  return {
    service: new CodeService(prisma, rounds, queue, judge0),
    count,
    create,
  };
}

const submit = (service: CodeService) =>
  service.submit('user-1', {
    roundId: 'round-1',
    challengeId: 'challenge-1',
    language: Language.PYTHON,
    sourceCode: 'print(1)',
  });

describe('Round.attemptLimit', () => {
  it('allows unlimited submissions when the limit is null', async () => {
    const { service, count, create } = buildService(null, 99);

    await expect(submit(service)).resolves.toMatchObject({ id: 'sub-1' });

    // No limit means no reason to ask the database how many were used.
    expect(count).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
  });

  it('accepts a submission while attempts remain', async () => {
    const { service, create } = buildService(3, 2);

    await expect(submit(service)).resolves.toMatchObject({ id: 'sub-1' });
    expect(create).toHaveBeenCalled();
  });

  it('refuses once the limit is reached, and writes nothing', async () => {
    const { service, create } = buildService(3, 3);

    await expect(submit(service)).rejects.toThrow(ForbiddenException);
    await expect(submit(service)).rejects.toThrow(/all 3 attempts/);
    expect(create).not.toHaveBeenCalled();
  });

  it('counts only graded submissions, never trial runs or platform failures', async () => {
    const { service, count } = buildService(3, 0);
    await submit(service);

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-1',
        roundId: 'round-1',
        // Scoped to the challenge: the cap is "N tries at this problem", not
        // N tries across everything in the round.
        challengeId: 'challenge-1',
        kind: 'SUBMIT',
        status: { not: 'SYSTEM_ERROR' },
      }),
    });
  });
});
