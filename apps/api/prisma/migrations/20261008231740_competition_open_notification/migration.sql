-- Adds one member to NotificationType. A separate migration rather than an edit
-- to 20261008115848_notifications, which has already been applied.
--
-- Safe inside Prisma's per-migration transaction because the new value is only
-- declared here, never used: Postgres forbids using a value added by
-- ALTER TYPE in the same transaction that added it, not adding it.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COMPETITION_OPEN';
