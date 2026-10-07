import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  ExecutionOutcome,
  ParticipationMode,
  Prisma,
  ScoreSource,
  SubmissionStatus,
} from '@prisma/client';
import { UnrecoverableError, type Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { gradeCoding } from '../scoring/scoring';
import { Judge0Client, Judge0RequestError, type Judge0SubmissionSpec } from './judge0.client';
import { EXECUTION_QUEUE, type GradeSubmissionJob } from './execution.constants';
import { isPass, isPlatformFault, LANGUAGE_IDS, toOutcome } from './judge0.status';

/// What a participant sees when grading failed on our side.
///
/// It used to say "An organizer has been notified", which was false: nothing in
/// the API alerts anyone. The only organizer-facing signal is a counter on the
/// admin console that someone has to go and look at. Claiming otherwise told a
/// participant to sit and wait for help that was not coming.
///
/// Item 7 adds in-app notifications; when GRADING_ALERT is wired to this path,
/// the sentence can be restored because it will then be true.
export const GRADING_FAILED_MESSAGE =
  'We could not grade that attempt. Something went wrong on our side, not in your code, ' +
  'and it does not count against your attempts. Try submitting again.';

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
            // A debugging challenge executes identically — same limits, same
            // hidden tests, same partial credit. Only the authoring and the
            // presentation differ, so the judge should not care which it is.
            debuggingChallenge: {
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

    // One resolver, deliberately: if the processor started branching on challenge
    // type in several places, that would be the signal these should have been a
    // single model.
    const executable =
      submission?.challenge.codingChallenge ?? submission?.challenge.debuggingChallenge;

    if (!submission) {
      // Nothing to grade and nothing to mark. Returning is right: a deleted
      // submission must not fail the job forever.
      this.logger.error(`Submission ${submissionId} no longer exists`);
      return;
    }

    // Grading is idempotent by refusing to run twice.
    //
    // BullMQ can redeliver a job — a stalled worker, a redeploy mid-flight, a
    // manual retry — and nothing here checked. A redelivery would flip a graded
    // submission back to RUNNING and re-run it, so a participant's finished
    // result briefly became "Running your code…" again, and the score was
    // rewritten from a second execution of the same source.
    if (submission.status === SubmissionStatus.COMPLETED) {
      this.logger.warn(
        `Submission ${submissionId} is already COMPLETED; skipping redelivered grading job`,
      );
      return;
    }

    if (!executable) {
      // Previously this returned silently, which left the row at QUEUED for
      // ever: no retry, no onFailed, no error — just a submission that never
      // resolved and a participant watching a spinner. Throwing routes it
      // through the normal failure path so it ends up visibly SYSTEM_ERROR.
      throw new Error(`Submission ${submissionId} has no executable challenge`);
    }

    const coding = executable;

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

    // A request Judge0 has already rejected as invalid cannot succeed on a
    // second attempt, so it is converted to BullMQ's UnrecoverableError, which
    // skips the remaining attempts and goes straight to onFailed. Retrying it
    // only delays the participant's answer and spends queue capacity during a
    // live round. Everything else — timeouts, 5xx, a dropped connection — still
    // gets the full three attempts.
    let tokens: string[];
    let results: Awaited<ReturnType<Judge0Client['awaitBatch']>>;

    try {
      tokens = await this.judge0.submitBatch(specs);
      results = await this.judge0.awaitBatch(tokens);
    } catch (error) {
      if (error instanceof Judge0RequestError) {
        throw new UnrecoverableError(
          `Judge0 rejected submission ${submissionId}: ${error.message}`,
        );
      }
      throw error;
    }

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
    const submissionId = job.data.submissionId;

    // Every attempt is logged, not just the last, with the attempt number and
    // the underlying cause — otherwise two transient blips and a real fault are
    // indistinguishable after the fact.
    this.logger.error(
      `Grading attempt ${attemptsMade}/${maxAttempts} failed for submission ${submissionId}: ${error.message}`,
    );

    if (attemptsMade < maxAttempts) return;

    // `status: { not: COMPLETED }` is the guard, and updateMany is what makes it
    // expressible.
    //
    // The status transaction and the score write are separate steps, so a
    // failure in the second one fails the job after the first has already
    // committed. Without this, the third such failure relabelled a graded
    // submission as SYSTEM_ERROR while its score and passed-test counts stayed
    // on the row — the participant saw "we could not grade that attempt" over a
    // result that had, in fact, been graded and counted.
    const { count } = await this.prisma.submission.updateMany({
      where: { id: submissionId, status: { not: SubmissionStatus.COMPLETED } },
      data: {
        status: SubmissionStatus.SYSTEM_ERROR,
        errorMessage: GRADING_FAILED_MESSAGE,
        gradedAt: new Date(),
      },
    });

    if (count === 0) {
      this.logger.warn(
        `Grading job for ${submissionId} exhausted its attempts, but the submission is already COMPLETED; leaving the result intact`,
      );
    }
  }
}
