import { Injectable } from '@nestjs/common';
import { Prisma, ScoreSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { weightedContribution } from './scoring';

export interface RecordScoreInput {
  competitionId: string;
  roundId: string;
  userId: string;
  challengeId: string;
  source: ScoreSource;
  rawScore: number;
  maxRawScore: number;
  roundWeight: number;
  roundMaxPoints: number;
  timeToSolveMs: number | null;
  submissionId?: string;
  mcqAttemptId?: string;
}

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  /// The total points available in a round, used as the denominator that makes
  /// per-challenge weighted scores additive.
  async roundMaxPoints(roundId: string): Promise<number> {
    const links = await this.prisma.roundChallenge.findMany({
      where: { roundId },
      select: { challenge: { select: { points: true } } },
    });

    return links.reduce((sum, link) => sum + link.challenge.points, 0);
  }

  /// Upserted on (userId, roundId, challengeId): a participant's best result for
  /// a challenge is the one that counts, so a later, better coding submission
  /// replaces an earlier one rather than stacking with it.
  async record(input: RecordScoreInput) {
    const weightedScore = weightedContribution(
      input.rawScore,
      input.roundMaxPoints,
      input.roundWeight,
    );

    const data = {
      competitionId: input.competitionId,
      roundId: input.roundId,
      userId: input.userId,
      challengeId: input.challengeId,
      source: input.source,
      rawScore: new Prisma.Decimal(input.rawScore),
      maxRawScore: new Prisma.Decimal(input.maxRawScore),
      roundWeight: new Prisma.Decimal(input.roundWeight),
      weightedScore: new Prisma.Decimal(weightedScore),
      timeToSolveMs: input.timeToSolveMs,
      submissionId: input.submissionId ?? null,
      mcqAttemptId: input.mcqAttemptId ?? null,
    };

    const event = await this.prisma.scoreEvent.upsert({
      where: {
        userId_roundId_challengeId: {
          userId: input.userId,
          roundId: input.roundId,
          challengeId: input.challengeId,
        },
      },
      create: data,
      update: data,
    });

    // The cached board is now stale; the next poll rebuilds it.
    this.leaderboard.invalidate(input.competitionId);

    return event;
  }

  async bestExisting(userId: string, roundId: string, challengeId: string) {
    return this.prisma.scoreEvent.findUnique({
      where: { userId_roundId_challengeId: { userId, roundId, challengeId } },
      select: { rawScore: true },
    });
  }
}
