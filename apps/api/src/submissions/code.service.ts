import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  RoundType,
  SubmissionKind,
  SubmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoundsService } from '../rounds/rounds.service';
import { ExecutionQueue } from '../execution/execution.queue';
import { Judge0Client } from '../execution/judge0.client';
import { isPass, LANGUAGE_IDS, toOutcome, humanMessage } from '../execution/judge0.status';
import type { SubmitCodeDto } from './dto/code-submission.dto';

@Injectable()
export class CodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rounds: RoundsService,
    private readonly queue: ExecutionQueue,
    private readonly judge0: Judge0Client,
  ) {}

  /// Graded submission. Everything cheap is validated before a job is queued, so
  /// an invalid request never reaches Judge0.
  async submit(userId: string, dto: SubmitCodeDto) {
    const { round, coding, challenge } = await this.validate(userId, dto);

    const submission = await this.prisma.submission.create({
      data: {
        userId,
        challengeId: dto.challengeId,
        roundId: dto.roundId,
        kind: SubmissionKind.SUBMIT,
        language: dto.language,
        sourceCode: dto.sourceCode,
        status: SubmissionStatus.QUEUED,
        challengeVersion: challenge.version,
        // Immutable record of exactly what this submission was graded against,
        // hidden test cases included, so the result stays reproducible even if
        // the challenge is edited afterwards.
        challengeSnapshot: {
          title: challenge.title,
          points: challenge.points,
          statement: coding.statement,
          limits: {
            cpuTimeLimit: coding.cpuTimeLimit.toNumber(),
            wallTimeLimit: coding.wallTimeLimit.toNumber(),
            memoryLimitKb: coding.memoryLimitKb,
            maxProcesses: coding.maxProcesses,
            maxFileSizeKb: coding.maxFileSizeKb,
          },
          testCases: coding.testCases.map((tc) => ({
            id: tc.id,
            isHidden: tc.isHidden,
            weight: tc.weight,
            stdin: tc.stdin,
            expectedOutput: tc.expectedOutput,
          })),
        } as Prisma.InputJsonValue,
      },
      select: { id: true, status: true, submittedAt: true },
    });

    await this.queue.enqueue(submission.id);

    return submission;
  }

  /// Trial run against the visible test cases only. Never scored, never stored as
  /// a graded submission, and hidden cases are not part of it.
  async run(userId: string, dto: SubmitCodeDto) {
    const { coding } = await this.validate(userId, dto);

    const visible = coding.testCases.filter((tc) => !tc.isHidden);

    if (visible.length === 0) {
      throw new NotFoundException('This challenge has no sample tests to run against');
    }

    const tokens = await this.judge0.submitBatch(
      visible.map((tc) => ({
        languageId: LANGUAGE_IDS[dto.language],
        sourceCode: dto.sourceCode,
        stdin: tc.stdin,
        expectedOutput: tc.expectedOutput,
        cpuTimeLimit: coding.cpuTimeLimit.toNumber(),
        wallTimeLimit: coding.wallTimeLimit.toNumber(),
        memoryLimitKb: coding.memoryLimitKb,
        maxProcesses: coding.maxProcesses,
        maxFileSizeKb: coding.maxFileSizeKb,
      })),
    );

    const results = await this.judge0.awaitBatch(tokens);

    return {
      results: visible.map((tc, index) => {
        const result = results[index];
        const outcome = toOutcome(result.statusId);
        return {
          testCaseId: tc.id,
          passed: isPass(result.statusId),
          outcome,
          message: humanMessage(outcome),
          stdin: tc.stdin,
          expectedOutput: tc.expectedOutput,
          actualOutput: result.stdout,
          stderr: result.stderr,
          compileOutput: result.compileOutput,
          timeMs: result.timeSeconds ? Math.round(result.timeSeconds * 1000) : null,
        };
      }),
    };
  }

  async findOne(submissionId: string, userId: string) {
    // Ownership is part of the query, not a check after the fact — another
    // participant's submission simply does not resolve.
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, userId },
      select: {
        id: true,
        status: true,
        language: true,
        passedTests: true,
        totalTests: true,
        rawScore: true,
        compileOutput: true,
        errorMessage: true,
        executionMs: true,
        submittedAt: true,
        gradedAt: true,
        challenge: { select: { id: true, title: true, points: true } },
        results: {
          orderBy: { testCase: { orderIndex: 'asc' } },
          select: {
            passed: true,
            outcome: true,
            timeMs: true,
            actualOutput: true,
            stderr: true,
            testCase: { select: { id: true, isHidden: true } },
          },
        },
      },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    return {
      ...submission,
      results: submission.results.map((r) => ({
        testCaseId: r.testCase.id,
        hidden: r.testCase.isHidden,
        passed: r.passed,
        outcome: r.outcome,
        message: humanMessage(r.outcome),
        timeMs: r.timeMs,
        // A hidden case reports pass or fail and nothing else.
        actualOutput: r.testCase.isHidden ? null : r.actualOutput,
        stderr: r.testCase.isHidden ? null : r.stderr,
      })),
    };
  }

  async listMine(userId: string, roundId: string) {
    return this.prisma.submission.findMany({
      where: { userId, roundId, kind: SubmissionKind.SUBMIT },
      orderBy: { submittedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        challengeId: true,
        language: true,
        status: true,
        passedTests: true,
        totalTests: true,
        rawScore: true,
        submittedAt: true,
        gradedAt: true,
      },
    });
  }

  private async validate(userId: string, dto: SubmitCodeDto) {
    const round = await this.rounds.requireLiveRound(dto.roundId);

    if (round.type !== RoundType.CODING) {
      throw new ForbiddenException('This round does not accept code submissions');
    }

    if (!round.allowedLanguages.includes(dto.language)) {
      throw new ForbiddenException(
        `${dto.language} is not permitted in this round`,
      );
    }

    const enrolled = await this.prisma.competitionParticipant.findUnique({
      where: { competitionId_userId: { competitionId: round.competitionId, userId } },
      select: { id: true },
    });

    if (!enrolled) {
      throw new ForbiddenException('Join the competition before submitting code');
    }

    const link = await this.prisma.roundChallenge.findUnique({
      where: { roundId_challengeId: { roundId: dto.roundId, challengeId: dto.challengeId } },
      select: {
        challenge: {
          select: {
            id: true,
            title: true,
            points: true,
            version: true,
            codingChallenge: {
              select: {
                statement: true,
                cpuTimeLimit: true,
                wallTimeLimit: true,
                memoryLimitKb: true,
                maxProcesses: true,
                maxFileSizeKb: true,
                testCases: {
                  orderBy: { orderIndex: 'asc' },
                  select: {
                    id: true,
                    stdin: true,
                    expectedOutput: true,
                    isHidden: true,
                    weight: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!link?.challenge.codingChallenge) {
      throw new NotFoundException('Challenge not found in this round');
    }

    return {
      round,
      challenge: link.challenge,
      coding: link.challenge.codingChallenge,
    };
  }
}
