import { Prisma } from '@prisma/client';

/// Participant-facing shape. `isCorrect` on options and the stdin/expectedOutput
/// of hidden test cases are absent from this selector entirely — they are never
/// fetched, so no downstream serialization mistake can leak them.
export const PARTICIPANT_CHALLENGE_SELECT = {
  id: true,
  type: true,
  title: true,
  category: true,
  difficulty: true,
  points: true,
  version: true,
  mcqQuestion: {
    select: {
      id: true,
      prompt: true,
      codeSnippet: true,
      options: {
        orderBy: { orderIndex: 'asc' },
        select: { id: true, label: true, text: true },
      },
    },
  },
  codingChallenge: {
    select: {
      id: true,
      statement: true,
      constraints: true,
      inputFormat: true,
      outputFormat: true,
      starterCodePy: true,
      starterCodeJs: true,
      cpuTimeLimit: true,
      memoryLimitKb: true,
      testCases: {
        where: { isHidden: false },
        orderBy: { orderIndex: 'asc' },
        select: { id: true, stdin: true, expectedOutput: true },
      },
    },
  },
} satisfies Prisma.ChallengeSelect;

/// Organizer-facing shape: everything, including answers and hidden tests.
export const ORGANIZER_CHALLENGE_SELECT = {
  id: true,
  type: true,
  title: true,
  category: true,
  difficulty: true,
  points: true,
  version: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  mcqQuestion: {
    select: {
      id: true,
      prompt: true,
      codeSnippet: true,
      explanation: true,
      options: {
        orderBy: { orderIndex: 'asc' },
        select: { id: true, label: true, text: true, isCorrect: true },
      },
    },
  },
  codingChallenge: {
    select: {
      id: true,
      statement: true,
      constraints: true,
      inputFormat: true,
      outputFormat: true,
      starterCodePy: true,
      starterCodeJs: true,
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
} satisfies Prisma.ChallengeSelect;
