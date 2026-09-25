#!/bin/sh
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
#!/bin/sh
set -eu
for i in $(seq 1 30); do
  node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().\$queryRaw\`SELECT 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1))" && break
  echo "[entrypoint] database unreachable, retry $i"; sleep 4
done
node node_modules/prisma/build/index.js migrate deploy
exec "$@"

echo "[entrypoint] applying migrations"
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] starting api"
exec "$@"
