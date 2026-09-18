import { ExecutionOutcome, Language } from '@prisma/client';

/// Judge0 status ids, mapped in one place so the rest of the codebase never deals
/// in magic numbers. Reference: Judge0 CE `GET /statuses`.
export const JUDGE0_STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR_SIGSEGV: 7,
  RUNTIME_ERROR_SIGXFSZ: 8,
  RUNTIME_ERROR_SIGFPE: 9,
  RUNTIME_ERROR_SIGABRT: 10,
  RUNTIME_ERROR_NZEC: 11,
  RUNTIME_ERROR_OTHER: 12,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
} as const;

const OUTCOME_BY_STATUS: Record<number, ExecutionOutcome> = {
  [JUDGE0_STATUS.ACCEPTED]: ExecutionOutcome.ACCEPTED,
  [JUDGE0_STATUS.WRONG_ANSWER]: ExecutionOutcome.WRONG_ANSWER,
  [JUDGE0_STATUS.TIME_LIMIT_EXCEEDED]: ExecutionOutcome.TIME_LIMIT_EXCEEDED,
  [JUDGE0_STATUS.COMPILATION_ERROR]: ExecutionOutcome.COMPILATION_ERROR,
  // Judge0 has no distinct out-of-memory status; an exhausted memory limit
  // surfaces as SIGSEGV or NZEC, so both map to a runtime error.
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGSEGV]: ExecutionOutcome.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGXFSZ]: ExecutionOutcome.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGFPE]: ExecutionOutcome.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGABRT]: ExecutionOutcome.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_NZEC]: ExecutionOutcome.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_OTHER]: ExecutionOutcome.RUNTIME_ERROR,
  [JUDGE0_STATUS.INTERNAL_ERROR]: ExecutionOutcome.INTERNAL_ERROR,
  [JUDGE0_STATUS.EXEC_FORMAT_ERROR]: ExecutionOutcome.INTERNAL_ERROR,
};

export function toOutcome(statusId: number): ExecutionOutcome {
  return OUTCOME_BY_STATUS[statusId] ?? ExecutionOutcome.INTERNAL_ERROR;
}

export function isTerminal(statusId: number): boolean {
  return statusId !== JUDGE0_STATUS.IN_QUEUE && statusId !== JUDGE0_STATUS.PROCESSING;
}

/// Only a status of ACCEPTED counts as a passing test case.
export function isPass(statusId: number): boolean {
  return statusId === JUDGE0_STATUS.ACCEPTED;
}

/// A platform fault rather than a fault in the participant's code. These must not
/// count against the participant.
export function isPlatformFault(statusId: number): boolean {
  return (
    statusId === JUDGE0_STATUS.INTERNAL_ERROR ||
    statusId === JUDGE0_STATUS.EXEC_FORMAT_ERROR
  );
}

/// Judge0 CE language ids. Verify against `GET /languages` on the deployed
/// instance — ids differ between Judge0 releases.
export const LANGUAGE_IDS: Record<Language, number> = {
  [Language.PYTHON]: 71, // Python (3.8.1)
  [Language.JAVASCRIPT]: 63, // JavaScript (Node.js 12.14.0)
  [Language.TYPESCRIPT]: 74, // TypeScript (3.7.4)
  [Language.JAVA]: 62, // Java (OpenJDK 13.0.1)
  [Language.CPP]: 54, // C++ (GCC 9.2.0)
  [Language.C]: 50, // C (GCC 9.2.0)
  [Language.GO]: 60, // Go (1.13.5)
  [Language.CSHARP]: 51, // C# (Mono 6.6.0.161)
};

/// What a participant sees in the language picker.
export const LANGUAGE_LABELS: Record<Language, string> = {
  [Language.PYTHON]: 'Python 3',
  [Language.JAVASCRIPT]: 'JavaScript',
  [Language.TYPESCRIPT]: 'TypeScript',
  [Language.JAVA]: 'Java',
  [Language.CPP]: 'C++',
  [Language.C]: 'C',
  [Language.GO]: 'Go',
  [Language.CSHARP]: 'C#',
};

export function humanMessage(outcome: ExecutionOutcome): string {
  switch (outcome) {
    case ExecutionOutcome.ACCEPTED:
      return 'Passed';
    case ExecutionOutcome.WRONG_ANSWER:
      return 'Output did not match the expected result';
    case ExecutionOutcome.TIME_LIMIT_EXCEEDED:
      return 'Took too long — check for an infinite loop or an inefficient algorithm';
    case ExecutionOutcome.MEMORY_LIMIT_EXCEEDED:
      return 'Used too much memory';
    case ExecutionOutcome.COMPILATION_ERROR:
      return 'Your code failed to compile';
    case ExecutionOutcome.RUNTIME_ERROR:
      return 'Your code crashed while running';
    case ExecutionOutcome.INTERNAL_ERROR:
      return 'The grading service hit a problem — this is not your fault';
  }
}
