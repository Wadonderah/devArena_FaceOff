import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChallengeType, Prisma, RoundState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ORGANIZER_CHALLENGE_SELECT,
  PARTICIPANT_CHALLENGE_SELECT,
} from './challenge.selectors';
import type {
  CreateCodingChallengeDto,
  CreateMCQChallengeDto,
  PublishChallengeDto,
} from './dto/challenge.dto';

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  async createMCQ(dto: CreateMCQChallengeDto) {
    const correct = dto.options.filter((o) => o.isCorrect);
    if (correct.length !== 1) {
      throw new BadRequestException('An MCQ must have exactly one correct option');
    }

    const labels = new Set(dto.options.map((o) => o.label));
    if (labels.size !== 4) {
      throw new BadRequestException('Options must be labelled A, B, C and D exactly once each');
    }

    return this.prisma.challenge.create({
      data: {
        type: ChallengeType.MCQ,
        title: dto.title,
        category: dto.category,
        difficulty: dto.difficulty,
        points: dto.points,
        mcqQuestion: {
          create: {
            prompt: dto.prompt,
            codeSnippet: dto.codeSnippet,
            explanation: dto.explanation,
            options: {
              create: dto.options.map((option, orderIndex) => ({
                label: option.label,
                text: option.text,
                isCorrect: option.isCorrect,
                orderIndex,
              })),
            },
          },
        },
      },
      select: ORGANIZER_CHALLENGE_SELECT,
    });
  }

  async createCoding(dto: CreateCodingChallengeDto) {
    if (!dto.testCases.some((tc) => tc.isHidden)) {
      throw new BadRequestException(
        'A coding challenge needs at least one hidden test case, or the solution can be hard-coded',
      );
    }

    if (!dto.testCases.some((tc) => !tc.isHidden)) {
      throw new BadRequestException(
        'A coding challenge needs at least one visible test case so participants can run their code',
      );
    }

    return this.prisma.challenge.create({
      data: {
        type: ChallengeType.CODING,
        title: dto.title,
        category: dto.category,
        difficulty: dto.difficulty,
        points: dto.points,
        codingChallenge: {
          create: {
            statement: dto.statement,
            constraints: dto.constraints,
            inputFormat: dto.inputFormat,
            outputFormat: dto.outputFormat,
            starterCodePy: dto.starterCodePy,
            starterCodeJs: dto.starterCodeJs,
            cpuTimeLimit: dto.cpuTimeLimit
              ? new Prisma.Decimal(dto.cpuTimeLimit)
              : undefined,
            memoryLimitKb: dto.memoryLimitKb,
            maxFileSizeKb: dto.maxFileSizeKb,
            testCases: {
              create: dto.testCases.map((tc, orderIndex) => ({
                stdin: tc.stdin,
                expectedOutput: tc.expectedOutput,
                isHidden: tc.isHidden,
                weight: tc.weight ?? 1,
                orderIndex,
              })),
            },
          },
        },
      },
      select: ORGANIZER_CHALLENGE_SELECT,
    });
  }

  async setPublished(challengeId: string, dto: PublishChallengeDto) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, isPublished: true },
    });
    if (!challenge) throw new NotFoundException('Challenge not found');

    if (!dto.isPublished) {
      const inUse = await this.prisma.roundChallenge.count({
        where: {
          challengeId,
          round: { state: { in: [RoundState.LIVE, RoundState.COMPLETED] } },
        },
      });
      if (inUse > 0) {
        throw new ForbiddenException(
          'This challenge is part of a live or completed round and cannot be unpublished',
        );
      }
    }

    return this.prisma.challenge.update({
      where: { id: challengeId },
      data: { isPublished: dto.isPublished },
      select: ORGANIZER_CHALLENGE_SELECT,
    });
  }

  async listForOrganizer(type?: ChallengeType) {
    return this.prisma.challenge.findMany({
      where: type ? { type } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        category: true,
        difficulty: true,
        points: true,
        version: true,
        isPublished: true,
        createdAt: true,
      },
    });
  }

  async findOneForOrganizer(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: ORGANIZER_CHALLENGE_SELECT,
    });
    if (!challenge) throw new NotFoundException('Challenge not found');
    return challenge;
  }

  /// A participant may only read a challenge that belongs to a round they are
  /// enrolled in and that is currently live. Before the round starts there is
  /// nothing to see; after it ends the content is no longer needed.
  async findOneForParticipant(challengeId: string, roundId: string, userId: string) {
    const link = await this.prisma.roundChallenge.findUnique({
      where: { roundId_challengeId: { roundId, challengeId } },
      select: {
        round: {
          select: {
            id: true,
            competitionId: true,
            state: true,
            startsAt: true,
            endsAt: true,
          },
        },
      },
    });

    if (!link) throw new NotFoundException('Challenge not found in this round');

    const { round } = link;

    if (round.state !== RoundState.LIVE) {
      throw new ForbiddenException('This round is not currently open');
    }

    const now = new Date();
    if ((round.startsAt && now < round.startsAt) || (round.endsAt && now > round.endsAt)) {
      throw new ForbiddenException('This round is not currently open');
    }

    const enrolled = await this.prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: { competitionId: round.competitionId, userId },
      },
      select: { id: true },
    });

    if (!enrolled) {
      throw new ForbiddenException('Join the competition to view its challenges');
    }

    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: PARTICIPANT_CHALLENGE_SELECT,
    });

    if (!challenge) throw new NotFoundException('Challenge not found');
    return challenge;
  }

  /// Every organizer edit bumps the version so submissions graded against the
  /// previous content remain attributable to it.
  async bumpVersion(challengeId: string) {
    return this.prisma.challenge.update({
      where: { id: challengeId },
      data: { version: { increment: 1 } },
      select: { id: true, version: true },
    });
  }
}
