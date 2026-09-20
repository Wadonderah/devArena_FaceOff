import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ParticipationMode,
  Prisma,
  RevealMode,
  RoundType,
  ScoreSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { relabel, seededShuffle } from '../common/shuffle';
import { RoundsService } from '../rounds/rounds.service';
import { hasClosed } from '../rounds/round-state';
import { ScoringService } from '../scoring/scoring.service';
import { gradeMcq } from '../scoring/scoring';
import type { SubmitMcqAnswerDto } from './dto/mcq-answer.dto';

@Injectable()
export class McqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rounds: RoundsService,
    private readonly scoring: ScoringService,
  ) {}

  async submitAnswer(userId: string, dto: SubmitMcqAnswerDto) {
    const round = await this.rounds.requireLiveRound(dto.roundId);

    if (round.type !== RoundType.MCQ) {
      throw new ForbiddenException('This round does not accept MCQ answers');
    }

    await this.assertEnrolled(round.competitionId, userId);
    await this.assertTeamIfRequired(round.competitionId, userId, round.participationMode);

    const link = await this.prisma.roundChallenge.findUnique({
      where: { roundId_challengeId: { roundId: dto.roundId, challengeId: dto.challengeId } },
      select: {
        challenge: {
          select: {
            id: true,
            points: true,
            version: true,
            mcqQuestion: {
              select: {
                id: true,
                explanation: true,
                options: { select: { id: true, isCorrect: true } },
              },
            },
          },
        },
      },
    });

    if (!link?.challenge.mcqQuestion) {
      throw new NotFoundException('Question not found in this round');
    }

    const { challenge } = link;
    const question = challenge.mcqQuestion!;

    const selected = question.options.find((o) => o.id === dto.optionId);
    if (!selected) {
      throw new NotFoundException('That option does not belong to this question');
    }

    // One attempt per question PER ROUND. Enforced here for a clear error, and by
    // a unique index on (userId, roundId, questionId) so concurrent requests
    // cannot both land. Scoping to the round matters because the challenge
    // library is shared: the same question may appear in a later competition.
    const existing = await this.prisma.mCQAttempt.findUnique({
      where: {
        userId_roundId_questionId: {
          userId,
          roundId: dto.roundId,
          questionId: question.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('You have already answered this question');
    }

    const correctOption = question.options.find((o) => o.isCorrect)!;
    const isCorrect = selected.isCorrect;
    const rawScore = gradeMcq(isCorrect, challenge.points, round.negativeMarking.toNumber());

    const answeredAt = new Date();
    const timeToSolveMs = round.startsAt
      ? answeredAt.getTime() - round.startsAt.getTime()
      : null;

    try {
      const attempt = await this.prisma.mCQAttempt.create({
        data: {
          userId,
          challengeId: challenge.id,
          questionId: question.id,
          roundId: dto.roundId,
          selectedOptionId: selected.id,
          isCorrect,
          rawScore: new Prisma.Decimal(rawScore),
          questionVersion: challenge.version,
          correctOptionId: correctOption.id,
          answeredAt,
        },
        select: { id: true, answeredAt: true },
      });

      await this.scoring.record({
        competitionId: round.competitionId,
        roundId: dto.roundId,
        userId,
        challengeId: challenge.id,
        source: ScoreSource.MCQ,
        rawScore,
        maxRawScore: challenge.points,
        roundWeight: round.weight.toNumber(),
        roundMaxPoints: await this.scoring.roundMaxPoints(dto.roundId),
        timeToSolveMs,
        mcqAttemptId: attempt.id,
        participationMode: round.participationMode,
      });

      // The response SHAPE is discriminated rather than widened: under any mode
      // other than IMMEDIATE the correctness keys are absent entirely, so a client
      // cannot infer the answer from the presence of a null field.
      if (round.revealMode !== RevealMode.IMMEDIATE) {
        return { recorded: true, answeredAt: attempt.answeredAt, revealed: false as const };
      }

      return {
        recorded: true,
        answeredAt: attempt.answeredAt,
        revealed: true as const,
        isCorrect,
        correctOptionId: correctOption.id,
        explanation: question.explanation,
        pointsAwarded: rawScore,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You have already answered this question');
      }
      throw error;
    }
  }

  /// Which questions in a live round the participant has already answered, so
  /// the UI can resume correctly. Carries no correctness information.
  async progress(userId: string, roundId: string) {
    const attempts = await this.prisma.mCQAttempt.findMany({
      where: { userId, roundId },
      select: { challengeId: true, questionId: true, answeredAt: true },
    });

    const total = await this.prisma.roundChallenge.count({ where: { roundId } });

    return { answered: attempts, answeredCount: attempts.length, totalQuestions: total };
  }

  /// Full results including the correct answer and explanation. Available only
  /// once the round is COMPLETED or ARCHIVED.
  async results(userId: string, roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      select: { id: true, state: true, name: true, revealMode: true },
    });

    if (!round) throw new NotFoundException('Round not found');

    // NEVER means the answers stay closed permanently, not merely until the round
    // ends — an organizer choosing it wants the question bank kept reusable.
    if (round.revealMode === RevealMode.NEVER) {
      throw new ForbiddenException('Answers are not published for this round');
    }

    if (!hasClosed(round.state)) {
      throw new ForbiddenException('Results are published once the round closes');
    }

    const attempts = await this.prisma.mCQAttempt.findMany({
      where: { userId, roundId },
      orderBy: { answeredAt: 'asc' },
      select: {
        isCorrect: true,
        rawScore: true,
        selectedOptionId: true,
        correctOptionId: true,
        answeredAt: true,
        questionId: true,
        challenge: { select: { id: true, title: true, points: true } },
        question: {
          select: {
            prompt: true,
            explanation: true,
            options: {
              orderBy: { orderIndex: 'asc' },
              select: { id: true, label: true, text: true },
            },
          },
        },
      },
    });

    const earned = attempts.reduce((sum, a) => sum + a.rawScore.toNumber(), 0);
    const available = attempts.reduce((sum, a) => sum + a.challenge.points, 0);

    // Re-apply the participant's own ordering so the review screen shows the same
    // letters they answered under. Without this, someone who picked "C" during the
    // round would see their answer sitting against a different letter afterwards.
    const ordered = attempts.map((attempt) => ({
      ...attempt,
      question: {
        ...attempt.question,
        options: relabel(
          seededShuffle(attempt.question.options, `${userId}:${attempt.questionId}`),
        ),
      },
    }));

    return { round, attempts: ordered, earned, available };
  }

  /// A team round scores through the team, so an unteamed participant would
  /// submit work that lands nowhere. Better to refuse clearly than to silently
  /// drop their score.
  private async assertTeamIfRequired(
    competitionId: string,
    userId: string,
    mode: ParticipationMode,
  ): Promise<void> {
    if (mode === ParticipationMode.INDIVIDUAL) return;

    const membership = await this.prisma.teamMember.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('Join a team before taking part in this round');
    }
  }

  private async assertEnrolled(competitionId: string, userId: string): Promise<void> {
    const enrolled = await this.prisma.competitionParticipant.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
      select: { id: true },
    });

    if (!enrolled) {
      throw new ForbiddenException('Join the competition before submitting answers');
    }
  }
}
