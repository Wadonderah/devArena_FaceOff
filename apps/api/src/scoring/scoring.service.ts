import { Injectable, Logger } from '@nestjs/common';
import { ParticipationMode, Prisma, RoundState, ScoreSource } from '@prisma/client';
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
  participationMode?: ParticipationMode;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

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
    // A finalized round's results have been published. Refusing here rather than
    // in each caller means a late-arriving judge result cannot quietly rewrite a
    // standing that people have already been told is final.
    const round = await this.prisma.round.findUnique({
      where: { id: input.roundId },
      select: { state: true },
    });

    if (
      round &&
      (round.state === RoundState.FINALIZED || round.state === RoundState.ARCHIVED)
    ) {
      this.logger.warn(
        `Refused a score write to ${round.state} round ${input.roundId} for user ${input.userId}`,
      );
      return null;
    }

    const weightedScore = weightedContribution(
      input.rawScore,
      input.roundMaxPoints,
      input.roundWeight,
    );

    // Resolved here rather than passed in, so every caller attributes team score
    // the same way and none can forget.
    const teamId =
      input.participationMode && input.participationMode !== ParticipationMode.INDIVIDUAL
        ? await this.teamIdFor(input.competitionId, input.userId)
        : null;

    const data = {
      competitionId: input.competitionId,
      teamId,
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

  private async teamIdFor(competitionId: string, userId: string): Promise<string | null> {
    const membership = await this.prisma.teamMember.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
      select: { teamId: true },
    });

    return membership?.teamId ?? null;
  }

  async bestExisting(userId: string, roundId: string, challengeId: string) {
    return this.prisma.scoreEvent.findUnique({
      where: { userId_roundId_challengeId: { userId, roundId, challengeId } },
      select: { rawScore: true },
    });
  }
}
