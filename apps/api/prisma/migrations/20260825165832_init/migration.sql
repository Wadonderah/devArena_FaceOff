-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PARTICIPANT', 'ORGANIZER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CompetitionState" AS ENUM ('DRAFT', 'REGISTRATION', 'LIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoundState" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoundType" AS ENUM ('MCQ', 'CODING');

-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('MCQ', 'CODING');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('BEGINNER', 'EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('PROGRAMMING_FUNDAMENTALS', 'ALGORITHMS', 'DATA_STRUCTURES', 'BACKEND_ENGINEERING', 'DATABASES_SQL', 'GIT_GITHUB');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('PYTHON', 'JAVASCRIPT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SYSTEM_ERROR');

-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('RUN', 'SUBMIT');

-- CreateEnum
CREATE TYPE "ExecutionOutcome" AS ENUM ('ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'INTERNAL_ERROR');

-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('MCQ', 'CODING');

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARTICIPANT',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "country" TEXT,
    "githubUrl" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" "VerificationTokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "state" "CompetitionState" NOT NULL DEFAULT 'DRAFT',
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_participants" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "RoundType" NOT NULL,
    "state" "RoundState" NOT NULL DEFAULT 'DRAFT',
    "orderIndex" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "weight" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "allowedLanguages" "Language"[] DEFAULT ARRAY[]::"Language"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_challenges" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "round_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "type" "ChallengeType" NOT NULL,
    "title" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 10,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcq_questions" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "codeSnippet" TEXT,
    "explanation" TEXT,

    CONSTRAINT "mcq_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcq_options" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "mcq_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coding_challenges" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "statement" TEXT NOT NULL,
    "constraints" TEXT,
    "inputFormat" TEXT,
    "outputFormat" TEXT,
    "starterCodePy" TEXT,
    "starterCodeJs" TEXT,
    "cpuTimeLimit" DECIMAL(5,2) NOT NULL DEFAULT 2.0,
    "wallTimeLimit" DECIMAL(5,2) NOT NULL DEFAULT 6.0,
    "memoryLimitKb" INTEGER NOT NULL DEFAULT 128000,
    "maxProcesses" INTEGER NOT NULL DEFAULT 30,
    "maxFileSizeKb" INTEGER NOT NULL DEFAULT 4096,

    CONSTRAINT "coding_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" UUID NOT NULL,
    "codingChallengeId" UUID NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT true,
    "stdin" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "kind" "SubmissionKind" NOT NULL DEFAULT 'SUBMIT',
    "language" "Language" NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "challengeVersion" INTEGER NOT NULL,
    "challengeSnapshot" JSONB NOT NULL,
    "passedTests" INTEGER,
    "totalTests" INTEGER,
    "rawScore" DECIMAL(10,4),
    "compileOutput" TEXT,
    "errorMessage" TEXT,
    "executionMs" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_results" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "testCaseId" UUID NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "outcome" "ExecutionOutcome" NOT NULL,
    "timeMs" INTEGER,
    "memoryKb" INTEGER,
    "actualOutput" TEXT,
    "stderr" TEXT,

    CONSTRAINT "submission_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcq_attempts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "selectedOptionId" UUID NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "rawScore" DECIMAL(10,4) NOT NULL,
    "questionVersion" INTEGER NOT NULL,
    "correctOptionId" UUID NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcq_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_events" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "source" "ScoreSource" NOT NULL,
    "rawScore" DECIMAL(10,4) NOT NULL,
    "maxRawScore" DECIMAL(10,4) NOT NULL,
    "roundWeight" DECIMAL(5,4) NOT NULL,
    "weightedScore" DECIMAL(10,6) NOT NULL,
    "submissionId" UUID,
    "mcqAttemptId" UUID,
    "timeToSolveMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_familyId_idx" ON "refresh_tokens"("userId", "familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_tokenHash_key" ON "verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_type_idx" ON "verification_tokens"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "competitions_slug_key" ON "competitions"("slug");

-- CreateIndex
CREATE INDEX "competitions_state_idx" ON "competitions"("state");

-- CreateIndex
CREATE INDEX "competition_participants_userId_idx" ON "competition_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "competition_participants_competitionId_userId_key" ON "competition_participants"("competitionId", "userId");

-- CreateIndex
CREATE INDEX "rounds_competitionId_state_idx" ON "rounds"("competitionId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_competitionId_orderIndex_key" ON "rounds"("competitionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "round_challenges_roundId_challengeId_key" ON "round_challenges"("roundId", "challengeId");

-- CreateIndex
CREATE UNIQUE INDEX "round_challenges_roundId_orderIndex_key" ON "round_challenges"("roundId", "orderIndex");

-- CreateIndex
CREATE INDEX "challenges_type_isPublished_idx" ON "challenges"("type", "isPublished");

-- CreateIndex
CREATE INDEX "challenges_category_difficulty_idx" ON "challenges"("category", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "mcq_questions_challengeId_key" ON "mcq_questions"("challengeId");

-- CreateIndex
CREATE INDEX "mcq_options_questionId_idx" ON "mcq_options"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "mcq_options_questionId_label_key" ON "mcq_options"("questionId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "coding_challenges_challengeId_key" ON "coding_challenges"("challengeId");

-- CreateIndex
CREATE INDEX "test_cases_codingChallengeId_isHidden_idx" ON "test_cases"("codingChallengeId", "isHidden");

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_codingChallengeId_orderIndex_key" ON "test_cases"("codingChallengeId", "orderIndex");

-- CreateIndex
CREATE INDEX "submissions_userId_challengeId_idx" ON "submissions"("userId", "challengeId");

-- CreateIndex
CREATE INDEX "submissions_status_submittedAt_idx" ON "submissions"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "submissions_roundId_userId_idx" ON "submissions"("roundId", "userId");

-- CreateIndex
CREATE INDEX "submission_results_submissionId_idx" ON "submission_results"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "submission_results_submissionId_testCaseId_key" ON "submission_results"("submissionId", "testCaseId");

-- CreateIndex
CREATE INDEX "mcq_attempts_roundId_userId_idx" ON "mcq_attempts"("roundId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "mcq_attempts_userId_questionId_key" ON "mcq_attempts"("userId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "score_events_submissionId_key" ON "score_events"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "score_events_mcqAttemptId_key" ON "score_events"("mcqAttemptId");

-- CreateIndex
CREATE INDEX "score_events_competitionId_userId_idx" ON "score_events"("competitionId", "userId");

-- CreateIndex
CREATE INDEX "score_events_roundId_idx" ON "score_events"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "score_events_userId_roundId_challengeId_key" ON "score_events"("userId", "roundId", "challengeId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_participants" ADD CONSTRAINT "competition_participants_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_participants" ADD CONSTRAINT "competition_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_challenges" ADD CONSTRAINT "round_challenges_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_challenges" ADD CONSTRAINT "round_challenges_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_questions" ADD CONSTRAINT "mcq_questions_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_options" ADD CONSTRAINT "mcq_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "mcq_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coding_challenges" ADD CONSTRAINT "coding_challenges_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_codingChallengeId_fkey" FOREIGN KEY ("codingChallengeId") REFERENCES "coding_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_results" ADD CONSTRAINT "submission_results_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_results" ADD CONSTRAINT "submission_results_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_attempts" ADD CONSTRAINT "mcq_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_attempts" ADD CONSTRAINT "mcq_attempts_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_attempts" ADD CONSTRAINT "mcq_attempts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "mcq_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcq_attempts" ADD CONSTRAINT "mcq_attempts_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_mcqAttemptId_fkey" FOREIGN KEY ("mcqAttemptId") REFERENCES "mcq_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
