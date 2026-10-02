# devArena_FaceOff

Platform built for software engineering competitions: MCQs and timed coding rounds
with self hosted, sandboxed execution.

Live at **[faceoff.akwannya-hub.org](https://faceoff.akwannya-hub.org)**.
An [Akwannya Hub](https://akwannya-hub.org) program.

## New here?

**Read [ONBOARDING.md](./ONBOARDING.md).** It covers the architecture, the stack,
the repository layout, what is and is not built yet, the branching rules, and a
full local setup walkthrough written for developers new to this stack.

## Quick start

```bash
pnpm install
pnpm infra:up                              # Postgres :5433, Redis :6380 via Docker
cp apps/api/.env.example apps/api/.env     # then fill it in, see ONBOARDING.md 9.4
cp apps/web/.env.example apps/web/.env.local
pnpm --filter api exec prisma generate
pnpm db:migrate && pnpm db:seed
pnpm dev                                   # web :3000, api :4000
```

## Contributing

`main` is changed only through a reviewed pull request. Branch as
`feat/<short_description>`, and run `pnpm lint && pnpm typecheck && pnpm test`
before opening one. Details in [ONBOARDING.md](./ONBOARDING.md) section 8.
