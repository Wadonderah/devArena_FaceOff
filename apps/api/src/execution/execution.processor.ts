import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  ExecutionOutcome,
  ParticipationMode,
  Prisma,
  ScoreSource,
  SubmissionStatus,
} from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { gradeCoding } from '../scoring/scoring';
import { Judge0Client, type Judge0SubmissionSpec } from './judge0.client';
import { EXECUTION_QUEUE, type GradeSubmissionJob } from './execution.constants';
import { isPass, isPlatformFault, LANGUAGE_IDS, toOutcome } from './judge0.status';

@Processor(EXECUTION_QUEUE)
export class ExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExecutionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0: Judge0Client,
    private readonly scoring: ScoringService,
  ) {
    super();
  }

  async process(job: Job<GradeSubmissionJob>): Promise<void> {
    const { submissionId } = job.data;

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        challenge: {
          select: {
            id: true,
            points: true,
            codingChallenge: {
              select: {
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
        round: {
          select: {
            id: true,
            competitionId: true,
            weight: true,
            startsAt: true,
            participationMode: true,
          },
        },
      },
    });

    if (!submission?.challenge.codingChallenge) {
      this.logger.error(`Submission ${submissionId} is missing its coding challenge`);
      return;
    }

    const coding = submission.challenge.codingChallenge;

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.RUNNING },
    });

    const specs: Judge0SubmissionSpec[] = coding.testCases.map((tc) => ({
      languageId: LANGUAGE_IDS[submission.language],
      sourceCode: submission.sourceCode,
      stdin: tc.stdin,
      expectedOutput: tc.expectedOutput,
      cpuTimeLimit: coding.cpuTimeLimit.toNumber(),
      wallTimeLimit: coding.wallTimeLimit.toNumber(),
      memoryLimitKb: coding.memoryLimitKb,
      maxProcesses: coding.maxProcesses,
      maxFileSizeKb: coding.maxFileSizeKb,
    }));

    const tokens = await this.judge0.submitBatch(specs);
    const results = await this.judge0.awaitBatch(tokens);

    // A platform fault means the grading service failed, not the participant's
    // code. Throwing here lets BullMQ retry; only an exhausted retry budget
    // marks the submission SYSTEM_ERROR, and it never counts as a wrong answer.
    if (results.some((r) => isPlatformFault(r.statusId))) {
      throw new Error(`Judge0 reported an internal error for submission ${submissionId}`);
    }

    let passedWeight = 0;
    let totalWeight = 0;
    let passedCount = 0;
    let slowestMs = 0;
    let compileOutput: string | null = null;

    const resultRows = coding.testCases.map((tc, index) => {
      const result = results[index];
      const outcome = toOutcome(result.statusId);
      const passed = isPass(result.statusId);

      totalWeight += tc.weight;
      if (passed) {
        passedWeight += tc.weight;
        passedCount += 1;
      }

      const timeMs = result.timeSeconds ? Math.round(result.timeSeconds * 1000) : null;
      if (timeMs && timeMs > slowestMs) slowestMs = timeMs;

      if (outcome === ExecutionOutcome.COMPILATION_ERROR && !compileOutput) {
        compileOutput = result.compileOutput;
      }

      return {
        submissionId,
        testCaseId: tc.id,
        passed,
        outcome,
        timeMs,
        memoryKb: result.memoryKb,
        // Output is persisted only for visible test cases. Storing a hidden
        // case's actual output would put the expected answer within reach of any
        // later query that forgot to filter.
        actualOutput: tc.isHidden ? null : result.stdout,
        stderr: tc.isHidden ? null : result.stderr,
      };
    });

    const rawScore = gradeCoding(passedWeight, totalWeight, submission.challenge.points);

    await this.prisma.$transaction([
      this.prisma.submissionResult.deleteMany({ where: { submissionId } }),
      this.prisma.submissionResult.createMany({ data: resultRows }),
      this.prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: SubmissionStatus.COMPLETED,
          passedTests: passedCount,
          totalTests: coding.testCases.length,
          rawScore: new Prisma.Decimal(rawScore),
          compileOutput,
          executionMs: slowestMs || null,
          gradedAt: new Date(),
        },
      }),
    ]);

    await this.recordScore(submission, rawScore);
  }

  private async recordScore(
    submission: {
      id: string;
      userId: string;
      challengeId: string;
      submittedAt: Date;
      challenge: { points: number };
      round: {
        id: string;
        competitionId: string;
        weight: Prisma.Decimal;
        startsAt: Date | null;
        participationMode: ParticipationMode;
      };
    },
    rawScore: number,
  ): Promise<void> {
    // Only an improvement counts. A participant experimenting after a good
    // submission must not be able to lower their own score.
    const existing = await this.scoring.bestExisting(
      submission.userId,
      submission.round.id,
      submission.challengeId,
    );

    if (existing && existing.rawScore.toNumber() >= rawScore) {
      return;
    }

    const timeToSolveMs = submission.round.startsAt
      ? submission.submittedAt.getTime() - submission.round.startsAt.getTime()
      : null;

    await this.scoring.record({
      competitionId: submission.round.competitionId,
      roundId: submission.round.id,
      userId: submission.userId,
      challengeId: submission.challengeId,
      source: ScoreSource.CODING,
      rawScore,
      maxRawScore: submission.challenge.points,
      roundWeight: submission.round.weight.toNumber(),
      roundMaxPoints: await this.scoring.roundMaxPoints(submission.round.id),
      timeToSolveMs,
      submissionId: submission.id,
      participationMode: submission.round.participationMode,
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<GradeSubmissionJob>, error: Error): Promise<void> {
    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;

    this.logger.error(
      `Grading attempt ${attemptsMade}/${maxAttempts} failed for submission ${job.data.submissionId}: ${error.message}`,
    );

    if (attemptsMade >= maxAttempts) {
      await this.prisma.submission.update({
        where: { id: job.data.submissionId },
        data: {
          status: SubmissionStatus.SYSTEM_ERROR,
          errorMessage: 'Grading failed. An organizer has been notified — this is not your fault.',
          gradedAt: new Date(),
        },
      });
    }
  }
}
