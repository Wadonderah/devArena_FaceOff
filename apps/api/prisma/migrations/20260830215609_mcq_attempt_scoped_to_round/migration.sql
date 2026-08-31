-- DropIndex
DROP INDEX "mcq_attempts_userId_questionId_key";

-- CreateIndex
CREATE UNIQUE INDEX "mcq_attempts_userId_roundId_questionId_key" ON "mcq_attempts"("userId", "roundId", "questionId");

