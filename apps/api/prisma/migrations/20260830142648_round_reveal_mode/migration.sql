-- CreateEnum
CREATE TYPE "RevealMode" AS ENUM ('IMMEDIATE', 'ON_ROUND_END', 'NEVER');

-- AlterTable
ALTER TABLE "rounds" ADD COLUMN     "revealMode" "RevealMode" NOT NULL DEFAULT 'ON_ROUND_END';
