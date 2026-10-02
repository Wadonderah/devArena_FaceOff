#!/bin/sh
# Runs at container start, before the API binds a port.
set -eu

echo "[entrypoint] waiting for database"
i=0
until node -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().\$queryRaw\`SELECT 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1))"; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] database unreachable after 30 attempts, giving up"
    exit 1
  fi
  echo "[entrypoint] database unreachable, retry $i"
  sleep 4
done

echo "[entrypoint] applying migrations"
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] starting api"
exec "$@"
