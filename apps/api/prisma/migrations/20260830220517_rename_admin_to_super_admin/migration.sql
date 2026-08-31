-- Rename in place rather than add/backfill/drop: ALTER TYPE ... RENAME VALUE
-- preserves every existing row's value, so no user loses their role.
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';
