#!/bin/sh
set -eu

# Migrations run at container start, before the server binds a port.
#
# `migrate deploy` only applies migrations that already exist — it never
# generates one and never resets, so it is the safe verb for production.
# Prisma takes a Postgres advisory lock for the duration, so two containers
# starting at once cannot apply the same migration twice.
#
# `set -e` means a failed migration stops the container rather than starting an
# API against a schema it does not match. That is the outcome we want: a crash
# loop is visible, silent drift is not.
echo "[entrypoint] applying migrations"
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] starting api"
exec "$@"
