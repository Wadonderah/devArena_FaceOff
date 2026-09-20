export type Role = 'PARTICIPANT' | 'ORGANIZER' | 'SUPER_ADMIN';
export type RoundState =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'LIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FINALIZED'
  | 'ARCHIVED';
export type CompetitionState = 'DRAFT' | 'REGISTRATION' | 'LIVE' | 'COMPLETED' | 'ARCHIVED';
export type RoundType = 'MCQ' | 'CODING' | 'DEBUGGING';

/// Mirrors the ChallengeType enum. Deliberately a separate type from RoundType
/// even though the members currently match: a round is a container with a
/// lifecycle, a challenge is the thing inside it, and conflating them is what
/// let a debugging round list coding problems.
export type ChallengeType = 'MCQ' | 'CODING' | 'DEBUGGING';
export type Language =
  | 'PYTHON'
  | 'JAVASCRIPT'
  | 'TYPESCRIPT'
  | 'JAVA'
  | 'CPP'
  | 'C'
  | 'GO'
  | 'CSHARP';
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
  revealMode?: RevealMode;
  participationMode?: ParticipationMode;
  weight?: string | number;
  /// Null means unlimited. Graded submissions per challenge, not per round.
  attemptLimit?: number | null;
  /// Points deducted per wrong MCQ answer. Decimal, so it arrives as a string.
  negativeMarking?: string | number | null;
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
  maxTeamSize?: number | null;
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

export interface DebuggingChallenge {
  id: string;
  bugReport: string;
  failingTestOutput: string;
  brokenCode: Partial<Record<Language, string>>;
  contextFiles: Record<string, string> | null;
  testCases: TestCase[];
}

export interface Challenge {
  id: string;
  type: 'MCQ' | 'CODING' | 'DEBUGGING';
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
    /// Keyed by Language, e.g. { PYTHON: "...", JAVA: "..." }.
    starterCode: Partial<Record<Language, string>> | null;
    testCases: TestCase[];
  } | null;
  debuggingChallenge: DebuggingChallenge | null;
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

export type RevealMode = 'IMMEDIATE' | 'ON_ROUND_END' | 'NEVER';

/// Discriminated on `revealed`: under ON_ROUND_END and NEVER the correctness keys
/// are absent from the payload entirely, not merely null.
export type McqSubmitResponse =
  | { recorded: true; answeredAt: string; revealed: false }
  | {
      recorded: true;
      answeredAt: string;
      revealed: true;
      isCorrect: boolean;
      correctOptionId: string;
      explanation: string | null;
      pointsAwarded: number;
    };

export type ParticipationMode = 'INDIVIDUAL' | 'TEAM' | 'HYBRID';

export interface TeamMemberSummary {
  userId: string;
  joinedAt: string;
  user: {
    id: string;
    profile: { displayName: string; country: string | null; avatarUrl: string | null } | null;
  };
}

export interface Team {
  id: string;
  competitionId: string;
  name: string;
  /// Present only when the viewer is a member — it is the join credential.
  code?: string;
  avatarUrl: string | null;
  captainId: string;
  createdAt: string;
  members: TeamMemberSummary[];
}

export interface TeamLeaderboardRow {
  rank: number;
  teamId: string;
  name: string;
  memberCount: number;
  finalScore: number;
  completedChallenges: number;
  totalTimeMs: number;
  lastScoredAt: string | null;
}

export interface TeamLeaderboard {
  competition: { id: string; name: string; state: CompetitionState };
  rows: TeamLeaderboardRow[];
  generatedAt: string;
}

/// Shape of GET /admin/overview.
///
/// Shared because both the console strip and the console landing page read it
/// from one polled query — two local copies of this interface would drift the
/// first time a counter is added.
export interface Overview {
  competitions: number;
  participants: number;
  submissions: number;
  pendingSubmissions: number;
  failedSubmissions: number;
  liveRounds: number;
}
