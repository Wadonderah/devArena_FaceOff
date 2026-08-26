export type Role = 'PARTICIPANT' | 'ORGANIZER' | 'ADMIN';
export type RoundState = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'ARCHIVED';
export type CompetitionState = 'DRAFT' | 'REGISTRATION' | 'LIVE' | 'COMPLETED' | 'ARCHIVED';
export type RoundType = 'MCQ' | 'CODING';
export type Language = 'PYTHON' | 'JAVASCRIPT';
export type SubmissionStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SYSTEM_ERROR';

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

export interface Profile {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
  profile: {
    displayName: string;
    bio: string | null;
    country: string | null;
    githubUrl: string | null;
    avatarUrl: string | null;
  } | null;
}

export interface RoundSummary {
  id: string;
  name: string;
  description: string | null;
  type: RoundType;
  state: RoundState;
  orderIndex: number;
  startsAt: string | null;
  endsAt: string | null;
  allowedLanguages: Language[];
  _count: { challenges: number };
}

export interface Competition {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  state: CompetitionState;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  rounds: RoundSummary[];
  joined?: boolean;
}

export interface CompetitionListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  state: CompetitionState;
  _count?: { participants: number };
}

export interface McqOption {
  id: string;
  label: string;
  text: string;
}

export interface TestCase {
  id: string;
  stdin: string;
  expectedOutput: string;
}

export interface Challenge {
  id: string;
  type: 'MCQ' | 'CODING';
  title: string;
  category: string;
  difficulty: string;
  points: number;
  version: number;
  mcqQuestion: {
    id: string;
    prompt: string;
    codeSnippet: string | null;
    options: McqOption[];
  } | null;
  codingChallenge: {
    id: string;
    statement: string;
    constraints: string | null;
    inputFormat: string | null;
    outputFormat: string | null;
    starterCodePy: string | null;
    starterCodeJs: string | null;
    testCases: TestCase[];
  } | null;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  displayName: string;
  country: string | null;
  finalScore: number;
  completedChallenges: number;
  totalTimeMs: number;
  lastScoredAt: string | null;
}

export interface Leaderboard {
  competition: { id: string; name: string; state: CompetitionState };
  rows: LeaderboardRow[];
  generatedAt: string;
}

export interface McqProgress {
  answered: { challengeId: string; questionId: string; answeredAt: string }[];
  answeredCount: number;
  totalQuestions: number;
}

export interface RunResult {
  testCaseId: string;
  passed: boolean;
  outcome: string;
  message: string;
  stdin: string;
  expectedOutput: string;
  actualOutput: string | null;
  stderr: string | null;
  compileOutput: string | null;
  timeMs: number | null;
}

export interface SubmissionDetail {
  id: string;
  status: SubmissionStatus;
  language: Language;
  passedTests: number | null;
  totalTests: number | null;
  rawScore: string | null;
  compileOutput: string | null;
  errorMessage: string | null;
  executionMs: number | null;
  submittedAt: string;
  gradedAt: string | null;
  challenge: { id: string; title: string; points: number };
  results: {
    testCaseId: string;
    hidden: boolean;
    passed: boolean;
    outcome: string;
    message: string;
    timeMs: number | null;
    actualOutput: string | null;
    stderr: string | null;
  }[];
}
