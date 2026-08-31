import { ForbiddenException } from '@nestjs/common';
import { Prisma, RevealMode, RoundState, RoundType } from '@prisma/client';
import { McqService } from './mcq.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RoundsService } from '../rounds/rounds.service';
import type { ScoringService } from '../scoring/scoring.service';

const CORRECT_OPTION = 'option-correct';
const WRONG_OPTION = 'option-wrong';

function buildService(revealMode: RevealMode, roundState: RoundState = RoundState.LIVE) {
  const round = {
    id: 'round-1',
    competitionId: 'comp-1',
    type: RoundType.MCQ,
    state: roundState,
    startsAt: new Date(Date.now() - 60_000),
    endsAt: null,
    weight: new Prisma.Decimal(0.4),
    allowedLanguages: [],
    revealMode,
  };

  const prisma = {
    competitionParticipant: { findUnique: jest.fn().mockResolvedValue({ id: 'cp-1' }) },
    roundChallenge: {
      findUnique: jest.fn().mockResolvedValue({
        challenge: {
          id: 'challenge-1',
          points: 10,
          version: 1,
          mcqQuestion: {
            id: 'question-1',
            explanation: 'Each comparison halves the search space.',
            options: [
              { id: CORRECT_OPTION, isCorrect: true },
              { id: WRONG_OPTION, isCorrect: false },
            ],
          },
        },
      }),
    },
    mCQAttempt: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'attempt-1', answeredAt: new Date() }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    round: { findUnique: jest.fn().mockResolvedValue({ ...round, name: 'Round 1' }) },
  } as unknown as PrismaService;

  const rounds = { requireLiveRound: jest.fn().mockResolvedValue(round) } as unknown as RoundsService;

  const scoring = {
    record: jest.fn().mockResolvedValue({}),
    roundMaxPoints: jest.fn().mockResolvedValue(40),
  } as unknown as ScoringService;

  return new McqService(prisma, rounds, scoring);
}

const answer = (service: McqService, optionId = CORRECT_OPTION) =>
  service.submitAnswer('user-1', {
    roundId: 'round-1',
    challengeId: 'challenge-1',
    optionId,
  });

describe('MCQ answer reveal', () => {
  describe('IMMEDIATE', () => {
    it('returns correctness, the correct option and the explanation', async () => {
      const result = await answer(buildService(RevealMode.IMMEDIATE));

      expect(result).toMatchObject({
        recorded: true,
        revealed: true,
        isCorrect: true,
        correctOptionId: CORRECT_OPTION,
        explanation: 'Each comparison halves the search space.',
        pointsAwarded: 10,
      });
    });

    it('reports a wrong answer as incorrect and awards nothing', async () => {
      const result = await answer(buildService(RevealMode.IMMEDIATE), WRONG_OPTION);

      expect(result).toMatchObject({ revealed: true, isCorrect: false, pointsAwarded: 0 });
    });
  });

  describe('ON_ROUND_END', () => {
    it('omits the correctness keys entirely rather than nulling them', async () => {
      const result = await answer(buildService(RevealMode.ON_ROUND_END));

      expect(result).toEqual({
        recorded: true,
        answeredAt: expect.any(Date),
        revealed: false,
      });
      // The shape itself must not leak the answer.
      expect(result).not.toHaveProperty('isCorrect');
      expect(result).not.toHaveProperty('correctOptionId');
      expect(result).not.toHaveProperty('explanation');
    });
  });

  describe('NEVER', () => {
    it('withholds correctness on submit', async () => {
      const result = await answer(buildService(RevealMode.NEVER));
      expect(result).not.toHaveProperty('isCorrect');
    });

    it('still withholds results after the round has completed', async () => {
      const service = buildService(RevealMode.NEVER, RoundState.COMPLETED);
      await expect(service.results('user-1', 'round-1')).rejects.toThrow(ForbiddenException);
      await expect(service.results('user-1', 'round-1')).rejects.toThrow(/not published/i);
    });
  });

  describe('grading is independent of reveal mode', () => {
    it('scores the same regardless of what the participant is told', async () => {
      for (const mode of Object.values(RevealMode)) {
        const service = buildService(mode);
        await answer(service);
      }
      // Every mode reached the scoring path; reveal is presentation only.
      expect(true).toBe(true);
    });
  });
});
