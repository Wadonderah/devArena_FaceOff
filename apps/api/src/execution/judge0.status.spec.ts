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
});
