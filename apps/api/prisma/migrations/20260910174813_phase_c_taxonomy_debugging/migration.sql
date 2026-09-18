-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Category" ADD VALUE 'FRONTEND_ENGINEERING';
ALTER TYPE "Category" ADD VALUE 'APIS';
ALTER TYPE "Category" ADD VALUE 'DEBUGGING';
ALTER TYPE "Category" ADD VALUE 'TESTING';
ALTER TYPE "Category" ADD VALUE 'DEVOPS';
ALTER TYPE "Category" ADD VALUE 'CLOUD';
ALTER TYPE "Category" ADD VALUE 'SECURITY';
ALTER TYPE "Category" ADD VALUE 'SYSTEM_DESIGN';
ALTER TYPE "Category" ADD VALUE 'SOFTWARE_ARCHITECTURE';
ALTER TYPE "Category" ADD VALUE 'ENGINEERING_PRACTICES';
ALTER TYPE "Category" ADD VALUE 'PERFORMANCE';

-- AlterEnum
ALTER TYPE "ChallengeType" ADD VALUE 'DEBUGGING';

-- AlterEnum
ALTER TYPE "Difficulty" ADD VALUE 'EXPERT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Language" ADD VALUE 'TYPESCRIPT';
ALTER TYPE "Language" ADD VALUE 'JAVA';
ALTER TYPE "Language" ADD VALUE 'CPP';
ALTER TYPE "Language" ADD VALUE 'C';
ALTER TYPE "Language" ADD VALUE 'GO';
ALTER TYPE "Language" ADD VALUE 'CSHARP';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RoundState" ADD VALUE 'PAUSED';
ALTER TYPE "RoundState" ADD VALUE 'FINALIZED';

-- AlterTable
-- Add the new column FIRST, carry the existing starter code across, and only
-- then drop the old ones. Prisma's generated order dropped them outright, which
-- would have discarded every authored starter snippet.
ALTER TABLE "coding_challenges" ADD COLUMN "starterCode" JSONB;

UPDATE "coding_challenges"
SET "starterCode" = (
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'PYTHON',     "starterCodePy",
      'JAVASCRIPT', "starterCodeJs"
    )
  )
)
WHERE "starterCodePy" IS NOT NULL OR "starterCodeJs" IS NOT NULL;

ALTER TABLE "coding_challenges" DROP COLUMN "starterCodeJs",
DROP COLUMN "starterCodePy";

-- AlterTable
ALTER TABLE "mcq_questions" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timeAllocationSeconds" INTEGER;

-- AlterTable
ALTER TABLE "rounds" ADD COLUMN     "attemptLimit" INTEGER,
ADD COLUMN     "negativeMarking" DECIMAL(6,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "test_cases" ADD COLUMN     "debuggingChallengeId" UUID,
ALTER COLUMN "codingChallengeId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "debugging_challenges" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "bugReport" TEXT NOT NULL,
    "failingTestOutput" TEXT NOT NULL,
    "brokenCode" JSONB NOT NULL,
    "contextFiles" JSONB,
    "cpuTimeLimit" DECIMAL(5,2) NOT NULL DEFAULT 2.0,
    "wallTimeLimit" DECIMAL(5,2) NOT NULL DEFAULT 6.0,
    "memoryLimitKb" INTEGER NOT NULL DEFAULT 128000,
    "maxProcesses" INTEGER NOT NULL DEFAULT 30,
    "maxFileSizeKb" INTEGER NOT NULL DEFAULT 1024,

    CONSTRAINT "debugging_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "debugging_challenges_challengeId_key" ON "debugging_challenges"("challengeId");

-- CreateIndex
CREATE INDEX "test_cases_debuggingChallengeId_isHidden_idx" ON "test_cases"("debuggingChallengeId", "isHidden");

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_debuggingChallengeId_orderIndex_key" ON "test_cases"("debuggingChallengeId", "orderIndex");

-- AddForeignKey
ALTER TABLE "debugging_challenges" ADD CONSTRAINT "debugging_challenges_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_debuggingChallengeId_fkey" FOREIGN KEY ("debuggingChallengeId") REFERENCES "debugging_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

