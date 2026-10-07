import { ExecutionOutcome } from '@prisma/client';
import {
  isPass,
  isPlatformFault,
  isTerminal,
  JUDGE0_STATUS,
  toOutcome,
} from './judge0.status';

describe('Judge0 status mapping', () => {
  it('maps a passing run to ACCEPTED', () => {
    expect(toOutcome(JUDGE0_STATUS.ACCEPTED)).toBe(ExecutionOutcome.ACCEPTED);
  });

  it('distinguishes a wrong answer from a crash', () => {
    expect(toOutcome(JUDGE0_STATUS.WRONG_ANSWER)).toBe(ExecutionOutcome.WRONG_ANSWER);
    expect(toOutcome(JUDGE0_STATUS.RUNTIME_ERROR_NZEC)).toBe(ExecutionOutcome.RUNTIME_ERROR);
  });

  it('surfaces a timeout distinctly so the UI can explain it', () => {
    expect(toOutcome(JUDGE0_STATUS.TIME_LIMIT_EXCEEDED)).toBe(
      ExecutionOutcome.TIME_LIMIT_EXCEEDED,
    );
  });

  it('surfaces a compilation error distinctly', () => {
    expect(toOutcome(JUDGE0_STATUS.COMPILATION_ERROR)).toBe(
      ExecutionOutcome.COMPILATION_ERROR,
    );
  });

  it('maps every runtime signal variant to RUNTIME_ERROR', () => {
    const signals = [
      JUDGE0_STATUS.RUNTIME_ERROR_SIGSEGV,
      JUDGE0_STATUS.RUNTIME_ERROR_SIGXFSZ,
      JUDGE0_STATUS.RUNTIME_ERROR_SIGFPE,
      JUDGE0_STATUS.RUNTIME_ERROR_SIGABRT,
      JUDGE0_STATUS.RUNTIME_ERROR_NZEC,
      JUDGE0_STATUS.RUNTIME_ERROR_OTHER,
    ];
    for (const status of signals) {
      expect(toOutcome(status)).toBe(ExecutionOutcome.RUNTIME_ERROR);
    }
  });

  it('treats an unknown status as an internal error rather than a pass', () => {
    expect(toOutcome(999)).toBe(ExecutionOutcome.INTERNAL_ERROR);
    expect(isPass(999)).toBe(false);
  });

  it('counts only ACCEPTED as a pass', () => {
    expect(isPass(JUDGE0_STATUS.ACCEPTED)).toBe(true);
    expect(isPass(JUDGE0_STATUS.WRONG_ANSWER)).toBe(false);
    expect(isPass(JUDGE0_STATUS.TIME_LIMIT_EXCEEDED)).toBe(false);
    expect(isPass(JUDGE0_STATUS.INTERNAL_ERROR)).toBe(false);
  });

  it('knows which statuses are still pending', () => {
    expect(isTerminal(JUDGE0_STATUS.IN_QUEUE)).toBe(false);
    expect(isTerminal(JUDGE0_STATUS.PROCESSING)).toBe(false);
    expect(isTerminal(JUDGE0_STATUS.ACCEPTED)).toBe(true);
    expect(isTerminal(JUDGE0_STATUS.WRONG_ANSWER)).toBe(true);
  });

  it('separates platform faults from participant faults', () => {
    expect(isPlatformFault(JUDGE0_STATUS.INTERNAL_ERROR)).toBe(true);
    expect(isPlatformFault(JUDGE0_STATUS.EXEC_FORMAT_ERROR)).toBe(true);
    expect(isPlatformFault(JUDGE0_STATUS.WRONG_ANSWER)).toBe(false);
    expect(isPlatformFault(JUDGE0_STATUS.RUNTIME_ERROR_NZEC)).toBe(false);
  });

  // toOutcome already sent anything unrecognised to INTERNAL_ERROR, but this
  // predicate listed only the two known ids. A status Judge0 adds later was
  // therefore RECORDED as a platform error while being SCORED as a failed test:
  // the participant silently lost the points and nothing retried. The two must
  // agree, so an unmapped terminal status is a fault on our side.
  it('treats an unrecognised terminal status as a platform fault', () => {
    expect(toOutcome(99)).toBe(ExecutionOutcome.INTERNAL_ERROR);
    expect(isPlatformFault(99)).toBe(true);
  });

  it('agrees with toOutcome for every status either knows about', () => {
    for (const statusId of [...Object.values(JUDGE0_STATUS), 42, 99, 1000]) {
      if (!isTerminal(statusId)) continue;
      // The invariant: anything reported as an internal error must also be
      // retryable, and nothing else may be.
      expect(isPlatformFault(statusId)).toBe(toOutcome(statusId) === ExecutionOutcome.INTERNAL_ERROR);
    }
  });

  // Pending statuses are absent from the outcome map by design; they are
  // isTerminal's business, not this predicate's.
  it('does not mistake a pending status for a fault', () => {
    expect(isPlatformFault(JUDGE0_STATUS.IN_QUEUE)).toBe(false);
    expect(isPlatformFault(JUDGE0_STATUS.PROCESSING)).toBe(false);
  });
});
