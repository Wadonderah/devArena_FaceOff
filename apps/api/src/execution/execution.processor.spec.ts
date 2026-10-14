import { SubmissionStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { ExecutionProcessor, GRADING_FAILED_MESSAGE } from './execution.processor';
import type { Judge0Client } from './judge0.client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ScoringService } from '../scoring/scoring.service';
import type { NotificationsService } from '../notifications/notifications.service';

function makeDeps(submission: unknown) {
  const prisma = {
    submission: {
      findUnique: jest.fn().mockResolvedValue(submission),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const judge0 = {
    submitBatch: jest.fn().mockResolvedValue(['tok-1']),
    awaitBatch: jest.fn().mockResolvedValue([]),
  };

  const scoring = { record: jest.fn(), bestExisting: jest.fn(), roundMaxPoints: jest.fn() };

  const notifications = { notifyStaff: jest.fn().mockResolvedValue(1) };

  const processor = new ExecutionProcessor(
    prisma as unknown as PrismaService,
    judge0 as unknown as Judge0Client,
    scoring as unknown as ScoringService,
    notifications as unknown as NotificationsService,
  );

  return { processor, prisma, judge0, notifications };
}

const job = (submissionId: string, attemptsMade = 3, attempts = 3) =>
  ({ data: { submissionId }, attemptsMade, opts: { attempts } }) as unknown as Job<{
    submissionId: string;
  }>;

// A minimally complete submission: enough shape for the guards under test,
// which run before anything touches the challenge payload.
const gradable = (status: SubmissionStatus) => ({
  id: 'sub-1',
  status,
  language: 'PYTHON',
  sourceCode: 'print(1)',
  challengeId: 'ch-1',
  userId: 'user-1',
  challenge: { codingChallenge: null, debuggingChallenge: null },
  round: { id: 'r-1', competitionId: 'c-1', weight: 1, startsAt: null, participationMode: null },
});

describe('ExecutionProcessor.process', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  // BullMQ can redeliver a job: a stalled worker, a redeploy mid-flight, a
  // manual retry. Nothing checked, so a redelivery flipped a graded submission
  // back to RUNNING and re-ran it — the participant's finished result briefly
  // became "Running your code…" again and the score was rewritten from a second
  // execution of the same source.
  it('skips a submission that is already COMPLETED', async () => {
    const { processor, prisma, judge0 } = makeDeps(gradable(SubmissionStatus.COMPLETED));

    await processor.process(job('sub-1'));

    expect(prisma.submission.update).not.toHaveBeenCalled();
    expect(judge0.submitBatch).not.toHaveBeenCalled();
  });

  // Previously a silent `return`, which left the row QUEUED for ever: no retry,
  // no onFailed, no error, and a participant watching a spinner that never
  // resolved. Throwing routes it through the normal failure path.
  it('throws rather than stranding a submission with no executable challenge', async () => {
    const { processor } = makeDeps(gradable(SubmissionStatus.QUEUED));

    await expect(processor.process(job('sub-1'))).rejects.toThrow(/no executable challenge/);
  });

  it('returns quietly when the submission no longer exists', async () => {
    const { processor, judge0 } = makeDeps(null);

    await expect(processor.process(job('sub-1'))).resolves.toBeUndefined();
    expect(judge0.submitBatch).not.toHaveBeenCalled();
  });
});

describe('ExecutionProcessor.onFailed', () => {
  afterEach(() => jest.restoreAllMocks());

  it('marks the submission SYSTEM_ERROR once the attempts are exhausted', async () => {
    const { processor, prisma } = makeDeps(gradable(SubmissionStatus.RUNNING));

    await processor.onFailed(job('sub-1', 3, 3), new Error('judge0 exploded'));

    expect(prisma.submission.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', status: { not: SubmissionStatus.COMPLETED } },
      data: expect.objectContaining({
        status: SubmissionStatus.SYSTEM_ERROR,
        errorMessage: GRADING_FAILED_MESSAGE,
      }),
    });
  });

  it('leaves the submission alone while attempts remain', async () => {
    const { processor, prisma } = makeDeps(gradable(SubmissionStatus.RUNNING));

    await processor.onFailed(job('sub-1', 1, 3), new Error('transient'));

    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  // The status transaction and the score write are separate steps, so a failure
  // in the second fails the job after the first has committed. Without the
  // guard, the third such failure relabelled a graded submission as
  // SYSTEM_ERROR while its score and passed-test counts stayed on the row — the
  // participant saw "we could not grade that attempt" over a result that had in
  // fact been graded and counted.
  it('cannot downgrade a submission that already completed', async () => {
    const { processor, prisma } = makeDeps(gradable(SubmissionStatus.COMPLETED));

    await processor.onFailed(job('sub-1', 3, 3), new Error('scoring blew up after grading'));

    const [[args]] = prisma.submission.updateMany.mock.calls;
    // The guard is in the WHERE, so the database decides, not a prior read.
    expect(args.where).toEqual({ id: 'sub-1', status: { not: SubmissionStatus.COMPLETED } });
  });

  // This assertion was the inverse until notifications existed: the sentence
  // had been removed because nothing in the API alerted anyone, and the test
  // existed to stop it creeping back. It is now paired with the test below, so
  // the claim and the mechanism cannot drift apart again — removing the alert
  // fails one of them, removing the sentence fails the other.
  it('tells the participant an organizer was notified', () => {
    expect(GRADING_FAILED_MESSAGE).toMatch(/organizer has been notified/i);
    expect(GRADING_FAILED_MESSAGE).toMatch(/not in your code/i);
  });

  it('alerts staff once the attempts are exhausted', async () => {
    const { processor, notifications } = makeDeps(gradable(SubmissionStatus.RUNNING));

    await processor.onFailed(job('sub-1', 3, 3), new Error('judge0 exploded'));

    expect(notifications.notifyStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GRADING_ALERT',
        // The fault string is staff-only context, so it belongs in metadata
        // rather than in a body a participant could ever see.
        metadata: expect.objectContaining({
          submissionId: 'sub-1',
          reason: 'judge0 exploded',
        }),
      }),
    );
  });

  it('does not alert while attempts remain', async () => {
    const { processor, notifications } = makeDeps(gradable(SubmissionStatus.RUNNING));

    await processor.onFailed(job('sub-1', 1, 3), new Error('transient'));

    expect(notifications.notifyStaff).not.toHaveBeenCalled();
  });

  // The submission was graded successfully and only the bookkeeping failed.
  // Alerting here would send staff to look at a result that is perfectly fine,
  // and on a bad day that is one alert per graded submission.
  it('does not alert when nothing was downgraded', async () => {
    const { processor, prisma, notifications } = makeDeps(gradable(SubmissionStatus.RUNNING));
    prisma.submission.updateMany.mockResolvedValue({ count: 0 });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await processor.onFailed(job('sub-1', 3, 3), new Error('scoring blew up after grading'));

    expect(notifications.notifyStaff).not.toHaveBeenCalled();
  });
});
