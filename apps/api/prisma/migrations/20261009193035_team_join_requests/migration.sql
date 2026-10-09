-- Team join requests. Additive: one enum, one table, no existing table touched.


-- CreateEnum
CREATE TYPE "TeamJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "team_join_requests" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "status" "TeamJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "respondedById" UUID,

    CONSTRAINT "team_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_join_requests_teamId_status_idx" ON "team_join_requests"("teamId", "status");

-- CreateIndex
CREATE INDEX "team_join_requests_competitionId_userId_status_idx" ON "team_join_requests"("competitionId", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "team_join_requests_teamId_userId_key" ON "team_join_requests"("teamId", "userId");

-- AddForeignKey
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

