# syntax=docker/dockerfile:1

# Build context is the REPO ROOT, not apps/api — pnpm needs the workspace file
# and the lockfile to resolve anything:
#   docker build -f apps/api/Dockerfile -t faceoff-api .

# Debian slim rather than Alpine: Prisma's query engine and bcrypt's native
# addon both want glibc + OpenSSL. Alpine works only with extra musl engine
# downloads and libc6-compat, and the failure mode is at runtime, not build.
FROM public.ecr.aws/docker/library/node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

# ── Dependencies ──────────────────────────────────────────────────────────────
# Only the manifests first, so a source-only change does not reinstall anything.
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
# --frozen-lockfile fails the build if the lockfile disagrees with the
# manifests, which is what we want in CI. The api filter keeps the web app's
# dependencies out of this image entirely.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --filter api... --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY apps/api/ apps/api/
# `prisma generate` is deliberately explicit here. It is wired into neither
# `build` nor `postinstall` in package.json, and relying on @prisma/client's own
# install hook breaks the moment a layer cache or --ignore-scripts skips it.
RUN pnpm --filter api exec prisma generate \
 && pnpm --filter api build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# node_modules is copied wholesale from the build stage rather than reinstalled
# with --prod. Two reasons, both deliberate:
#   1. bcrypt is a compiled addon. Copying the tree that was just built on this
#      exact base image avoids rebuilding it, and avoids the class of bug where
#      the runtime image silently gets a different binary.
#   2. `prisma migrate deploy` runs at container start (see docker-entrypoint.sh),
#      and the Prisma CLI is a devDependency. A --prod install would drop it.
# The cost is image size (~700 MB). For a single long-lived service on an
# instance we already own, that is the cheaper trade than a fragile install.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
# Schema AND migrations: `migrate deploy` needs both at runtime.
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint

# Never run as root. The node image ships an unprivileged `node` user.
USER node
WORKDIR /repo/apps/api

EXPOSE 4000

# Liveness only — it does no I/O. The readiness probe (/health) opens a fresh
# Redis connection and makes two Judge0 calls per hit, which is far too much to
# run every 30 seconds.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-4000}/health/live || exit 1

ENTRYPOINT ["entrypoint"]
CMD ["node", "dist/main.js"]
