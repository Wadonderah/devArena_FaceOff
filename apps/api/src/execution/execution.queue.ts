import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EXECUTION_QUEUE, type GradeSubmissionJob } from './execution.constants';

@Injectable()
export class ExecutionQueue {
  constructor(
    @InjectQueue(EXECUTION_QUEUE) private readonly queue: Queue<GradeSubmissionJob>,
  ) {}

  async enqueue(submissionId: string): Promise<void> {
    await this.queue.add(
      'grade',
      { submissionId },
      {
        // The job id is the submission id, so a duplicate enqueue for the same
        // submission is a no-op rather than a second grading run.
        jobId: submissionId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    );
  }

  async depth(): Promise<{ waiting: number; active: number; failed: number }> {
    const [waiting, active, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getFailedCount(),
    ]);
    return { waiting, active, failed };
  }
}
