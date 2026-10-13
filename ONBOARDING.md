# Face-Off: Onboarding Guide

**For volunteers and assistants helping with development and testing.**

Software Engineering Face-Off is a live competition platform built by
[Akwannya Hub](https://akwannya-hub.org). This guide takes you from "I have been
given a repository link" to "I have the app running on my machine and I know what
to test".

---

## 1. Welcome, and how to use this document

You do not need to read this end to end before you are useful.

| If you are here to... | Read |
| --- | --- |
| Understand what we are building | Sections 2, 3 |
| Test the app and file bugs | Sections 3, 7, 11 |
| Write code | Sections 4 through 9 |
| Look up a word you do not recognise | Section 10 |

**A promise about this document.** Everything in it was checked against the actual
repository, the actual live site, and actual git output on the day it was written.
Where something could not be verified, it says so instead of guessing. If you find
a claim here that is wrong, that is a bug in this document, and reporting it is a
genuinely useful contribution.

**Assumed knowledge.** You can use a terminal and you have used `git` at least
once. Everything beyond that is explained the first time it appears. If a term is
unfamiliar, check Section 10 before assuming you are missing something.

---

## 2. What Face-Off is

Face-Off is a website that runs timed programming competitions.

An **organizer** creates a competition and fills it with rounds. A **participant**
signs up, optionally joins a team, and plays through those rounds against the
clock. A leaderboard shows who is ahead.

There are three kinds of round:

- **Knowledge Arena.** Multiple-choice questions on algorithms, databases,
  security and similar topics. Graded the instant you answer.
- **Code Sprint.** You are given a problem, you write a solution in one of several
  languages, and the platform actually runs your code against test cases you
  cannot see.
- **Bug Hunt.** You are given code that runs but produces the wrong answer, plus a
  bug report. You find the fault and fix it. Hidden tests decide whether you
  really did.

The part that makes this more than a quiz site is the middle one. When you submit
code, a real program on a real server compiles and runs it, feeds it test inputs,
and compares the output. Doing that safely, for code written by strangers, is most
of the engineering in this project. See Section 4.

Two principles shape nearly every design decision here:

1. **The browser is never trusted.** Scores are computed on the server. Nothing the
   browser sends is accepted as a score.
2. **Test cases are hidden.** You see a sample or two. The tests that decide your
   score are not sent to the browser, so a solution cannot be hard coded to pass.

---

## 3. See it live

**[faceoff.akwannya-hub.org](https://faceoff.akwannya-hub.org)**

That is the real deployed site, not a demo. It, and both health endpoints below,
were returning HTTP 200 when this guide was last revised. The backend it talks to lives at
`https://api.akwannya-hub.org`, and `https://api.akwannya-hub.org/health/live` is
a small endpoint that answers "yes, I am running". If the site misbehaves, that
URL is the fastest way to tell whether the backend is down or the problem is
somewhere else.

Create an account and click around before you read any code. Fifteen minutes in
the product will make the next five sections much easier to follow.

---

## 4. Architecture overview

### 4.1 The pieces, and where they run

"Architecture" here just means: which programs exist, which machine each one runs
on, and who talks to whom.

```mermaid
flowchart TB
    subgraph browser["Your browser"]
        UI["Next.js pages<br/>(React)"]
    end

    subgraph vercel["Vercel (hosting company)"]
        WEB["Web app<br/>faceoff.akwannya-hub.org"]
    end

    subgraph ec2["One AWS EC2 server (a rented Linux machine)"]
        CADDY["Caddy<br/>(reverse proxy, HTTPS)"]
        API["NestJS API<br/>api.akwannya-hub.org"]
        WORKER["Execution worker<br/>(same process, background)"]
        REDIS["Redis<br/>(job queue)"]
        JUDGE0["Judge0<br/>(sandboxed code runner)"]
    end

    subgraph aiven["Aiven (hosting company)"]
        PG[("PostgreSQL<br/>database")]
    end

    UI -->|"loads pages from"| WEB
    UI -->|"HTTPS + cookies<br/>(data requests)"| CADDY
    CADDY --> API
    API -->|"reads and writes"| PG
    API -->|"queues grading jobs"| REDIS
    REDIS --> WORKER
    WORKER -->|"run this code"| JUDGE0
    WORKER -->|"saves results"| PG
```

Things worth noticing:

- **The browser talks to two different places.** It downloads the pages from
  Vercel, then makes data requests directly to the API on the EC2 server. They are
  separate deployments that can be updated independently.
- **The database is not on our server.** It is a managed PostgreSQL instance at
  Aiven, which means someone else handles backups and upgrades.
- **Judge0 never faces the internet.** Only the API can reach it. This matters,
  because Judge0 is the component that runs untrusted code.
- **The worker is not a separate program.** It runs inside the same API process,
  listening to the Redis queue. Drawn separately because it does a genuinely
  different job.
- **The database is a long way from the API, and this is a known problem.** The
  Aiven free tier hosts it in India while the server runs in Virginia, about
  216ms apart. Because recording one multiple-choice answer makes roughly eleven
  database round trips one after another, that answer takes about 2.4 seconds on
  the live site and 0.06 seconds on a laptop with a local database. **If the
  deployed site feels sluggish, this is why — it is not something you broke, and
  it does not need a new bug report.** It is measured and written up in
  `loadtest/PERFORMANCE-REPORT.md`, and the fix is to move the database.

### 4.2 What happens when you submit code

This is the most involved path in the system, and the one worth understanding
properly. The key idea: **submitting does not wait for grading.** The API accepts
your code, puts a job on a queue, and answers immediately. Grading happens
afterwards, and the browser asks repeatedly until an answer is ready.

Without that split, a slow submission would hold a connection open for however
long the code takes to compile and run, and one infinite loop could tie up the
server for everyone.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (code editor)
    participant A as API (NestJS)
    participant DB as PostgreSQL
    participant Q as Redis queue
    participant W as Worker
    participant J as Judge0

    B->>A: POST /submissions/code
    A->>A: Check sign-in, verified email,<br/>round is live, attempts left
    A->>DB: Save submission (status: QUEUED)
    A->>Q: Add grading job (id = submission id)
    A-->>B: Submission id (does not wait for a score)

    loop Until finished
        B->>A: GET /submissions/:id
        A-->>B: Current status
    end

    Q->>W: Deliver job
    W->>DB: status: RUNNING
    W->>J: Run this code against N hidden test cases
    J-->>W: Per-test results (passed, output, time, memory)
    W->>DB: Save results + status COMPLETED<br/>(one transaction)
    W->>DB: Record score (keeps the best attempt)
    A-->>B: COMPLETED + score
```

Details that trip people up:

- **The job id is the submission id.** Submitting the same thing twice cannot
  produce two grading runs, because the queue rejects a duplicate id.
- **A failed job retries three times** with a growing delay between attempts. If
  all three fail, the submission is marked `SYSTEM_ERROR`, which is deliberately
  distinct from "your code was wrong". `SYSTEM_ERROR` does not consume an attempt.
- **Results and status are written in one transaction**, so a submission is never
  left marked complete with no results attached.
- **Scoring keeps your best attempt**, not your most recent one.

---

## 5. Tech stack

Each row is one technology and the single most important reason it is here.

### Frontend (what runs in the browser)

| Layer | Technology | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | React with routing, server rendering and a build system already wired together |
| UI library | React 19 | Describes the interface as components instead of manual DOM updates |
| Language | TypeScript 5.9 | Catches type mistakes before the code runs |
| Styling | Tailwind CSS v4 | Styles written next to the markup, so a change cannot silently affect another page |
| Data fetching | TanStack Query | Handles caching, refetching and polling, which the submission flow in 4.2 needs |
| Code editor | CodeMirror 6 | The in-browser editor participants write solutions in |
| Animation | Framer Motion | Declarative animation that respects "reduce motion" accessibility settings |
| Icons | lucide-react | One consistent icon set |
| Hosting | Vercel | Made by the Next.js team, deploys on push |

### Backend (what runs on the server)

| Layer | Technology | Why |
| --- | --- | --- |
| Framework | NestJS 11 | Enforced structure, which keeps a project this size navigable |
| Language | TypeScript 5.9 | Same language as the frontend, so types can be shared |
| Database | PostgreSQL 16 (Aiven) | Relational data with real transactions, managed by someone else |
| Database access | Prisma 6 | Types generated from the schema, so a bad query fails at compile time |
| Queue | BullMQ on Redis | Lets grading happen after the response, per 4.2 |
| Code execution | Judge0 CE | Purpose built sandbox for running untrusted code |
| Authentication | JWT + Passport | Short lived access token in a cookie, with a refresh token to renew it |
| Social sign-in | Google OAuth 2.0 | Sign in without a password. Google-verified emails skip our own verification step |
| Password hashing | bcrypt | Deliberately slow, which makes stolen hashes expensive to crack |
| Validation | class-validator, Zod | Rejects malformed input at the edge, before it reaches business logic |
| Security headers | Helmet | Sets the HTTP headers that block several common browser attacks |
| Rate limiting | @nestjs/throttler | Caps requests per user, so one account cannot flood the API |
| Health checks | @nestjs/terminus | The `/health` endpoints from Section 3 |

### Everything else

| Layer | Technology | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces | Frontend and backend in one repository, one install, shared lockfile |
| Node.js | version 20.11 or newer | Required by `engines` in `package.json`. CI uses 22 |
| Local services | Docker Compose | Postgres and Redis without installing either on your machine |
| Tests | Jest | Unit tests in both apps. Run by `pnpm test` and by CI |
| CI | GitHub Actions | Lint, typecheck **and tests** on every pull request |
| Deployment | GitHub Actions to ECR, then AWS SSM | A push to `main` rebuilds and restarts the API |

---

## 6. Repository structure

Generated from the files git actually tracks. Directories with nothing you need
yet are left out.

```
devArena_FaceOff/
├── apps/
│   ├── api/                      Backend (NestJS)
│   │   ├── prisma/
│   │   │   ├── schema.prisma     THE database definition. Start here.
│   │   │   ├── migrations/       Ordered SQL files that build the database
│   │   │   └── seed.ts           Fills a fresh database with sample data
│   │   └── src/
│   │       ├── main.ts           Entry point. Boots the server.
│   │       ├── app.module.ts     Wires every module together
│   │       ├── auth/             Sign up, sign in, tokens, email verification
│   │       │   └── google/       Google OAuth sign-in
│   │       ├── users/            Accounts and profiles
│   │       ├── competitions/     Creating and running competitions
│   │       ├── rounds/           Rounds inside a competition
│   │       ├── challenges/       The question and problem bank
│   │       ├── teams/            Teams and join codes
│   │       ├── submissions/      Receives answers and code (see 4.2)
│   │       ├── execution/        The queue, the worker, the Judge0 client
│   │       ├── scoring/          Turns results into points
│   │       ├── leaderboard/      Rankings
│   │       ├── admin/            Organizer only operations
│   │       ├── notifications/    In-app notifications and announcements
│   │       ├── audit/            Records who changed what
│   │       ├── mail/             Sends verification emails
│   │       ├── health/           The /health endpoints
│   │       ├── config/           Reads and validates environment variables
│   │       ├── common/           Guards and helpers shared across modules
│   │       └── prisma/           Database connection service
│   │
│   └── web/                      Frontend (Next.js)
│       ├── app/                  Every URL is a folder here
│       │   ├── page.tsx            /                landing page
│       │   ├── login/              /login
│       │   ├── register/           /register
│       │   ├── verify-email/       /verify-email
│       │   ├── forgot-password/    /forgot-password
│       │   ├── reset-password/     /reset-password
│       │   ├── auth/callback/      /auth/callback   (returns from Google)
│       │   ├── dashboard/          /dashboard
│       │   ├── competitions/       /competitions and /competitions/[id]
│       │   ├── rounds/[id]/        /rounds/[id]/mcq, /coding, /debugging
│       │   ├── teams/[id]/         /teams/[id]
│       │   ├── leaderboard/[id]/   /leaderboard/[id]
│       │   ├── admin/              organizer pages, incl. /admin/system
│       │   │                        and /admin/announcements
│       │   └── globals.css         Colours, fonts, spacing tokens
│       ├── components/           Reusable UI pieces
│       ├── lib/                  API client, shared helpers, and the
│       │                         frontend unit tests (*.spec.ts)
│       └── middleware.ts         Runs before every page request
│
├── .github/workflows/
│   ├── ci.yml                    Lint and typecheck on every pull request
│   └── deploy.yml                Deploys the API when main changes
│
├── loadtest/                     Load and correctness testing kit (see below)
├── tools/
│   └── build_onboarding_pdf.py   Rebuilds the PDF of this document
├── docker-compose.dev.yml        Local Postgres and Redis
├── ONBOARDING.md                 This document
├── pnpm-workspace.yaml           Declares apps/* as workspace packages
└── package.json                  Root scripts (pnpm dev, pnpm test, ...)
```

**About `loadtest/`.** A kit that simulates up to 50 bot participants to find
limits before a real event: a Judge0 throughput test, a seed script, six k6
scenarios and a correctness verifier. You do not need it to develop features, and
it is **not** something to point at a database casually — it refuses any database
host that is not explicitly allowlisted. If you are asked to help with
performance work, start with `loadtest/README.md`, and read
`loadtest/PERFORMANCE-REPORT.md` for what the current numbers are and why.

**The two files to open first:** `apps/api/prisma/schema.prisma` tells you what
data exists in this system, and `apps/api/src/app.module.ts` tells you what the
backend can do. Between them they explain most of the project.

**Note on `docs/`.** There is a `docs/` folder on some maintainer machines that is
listed in `.gitignore`, so it is not in your clone and you are not missing
anything you were supposed to receive. If you need something from it, ask (Section
11).

---

## 7. Features, and what needs testing

Status meanings:

- **Ready** means built and working. Test it hard; we want to know where it breaks.
- **Partially implemented** means the main path works but something is missing.
  The gap is named so you do not report it as a surprise.
- **Not yet started** means it does not exist. Please do not file bugs for these.

### Accounts and authentication

| Feature | Status | What to test |
| --- | --- | --- |
| Register with email | Ready | Weak passwords, duplicate emails, odd characters in names |
| Email verification | Ready | Use the link twice. Wait for the 24 hour expiry. Request a new one |
| Sign in and sign out | Ready | Wrong password, unverified account, signing out in a second tab |
| Session stays alive | Ready | Leave a tab open past 15 minutes, then act. It should refresh, not eject you |
| Password reset | Ready | `/forgot-password` and `/reset-password` now exist. Use a link twice. Let one expire. Request two in a row |
| Sign in with Google | Ready | Sign up with Google, then try signing in with a password on the same email. Cancel at Google's consent screen. Note that Google accounts skip email verification |

### Competitions and rounds

| Feature | Status | What to test |
| --- | --- | --- |
| Create a competition | Ready | Missing fields, end date before start date |
| Competition states | Ready | Drive one through draft, live and ended. Try acting in the wrong state |
| Create rounds | Ready | All three types. Zero challenges. Overlapping times |
| Attach challenges | Ready | The picker should only offer the type matching the round |
| Start, pause, end a round | Ready | Pause mid attempt. Does the timer resume correctly? |
| Edit a round after creation | Ready | `PATCH /rounds/:id` now has a UI. Name, description, weight, start and end times, allowed languages, reveal mode, participation mode, attempt limit and negative marking are all editable. Try editing a live round, and a round that already has submissions |
| Change a round's weight | Ready, with a caveat worth testing | Changing a weight **rewrites every score event in that round** and so moves people on the leaderboard. **Nobody is notified.** Confirm the totals stay correct and that a round can never contribute more than its weight. A `FINALIZED` or `ARCHIVED` round is correctly locked — unlock it first |
| Delete a round | Ready | `DELETE /rounds/:id`. Delete one that has submissions and see what happens to their scores |
| Finalize, unlock, archive a round | Ready | Finalize, then try to score into it — late results must not rewrite a published standing |

### Taking part

| Feature | Status | What to test |
| --- | --- | --- |
| Join a competition | Ready | Join twice. Join one that already ended |
| Create and join teams | Ready | Wrong join code, full team, leaving, disbanding |
| Request to join a team | Ready | Ask to join, then withdraw. Approve and decline as captain. Request twice. Request while already in a team |
| Team changes while live | Ready | Leaving and removals are **deliberately blocked** during a live round. Not a bug |
| Answer MCQ questions | Ready | Answer past the deadline. Refresh mid round. Two tabs at once |
| Write and run code | Ready | Infinite loops, huge output, compile errors, all supported languages |
| Debugging rounds | Ready | Submit the code unchanged. Break it further. Then fix it |
| Attempt limits | Ready | Exhaust them. "Run" and system errors should **not** count |
| Leaderboard | Ready | Ties. Live updates during a round |
| In-app notifications | Ready | Round start and end, team joins, grading alerts, organizer announcements, and a competition opening for registration. Check the bell badge clears correctly and that a notification links somewhere useful |

### Organizer tools

| Feature | Status | What to test |
| --- | --- | --- |
| Challenge bank | Ready | Create each type. Add hidden test cases |
| Bulk import questions | Ready | Malformed files, wrong columns, duplicates |
| Edit a challenge after creation | **Not yet started** | No endpoint changes a challenge's content. `PATCH /challenges/:id/publish` only toggles visibility. A mistake means creating a new challenge |
| Audit log | Ready | Confirm state changes are recorded |
| Announcements | Ready | Send one, confirm every participant receives it. Empty and very long messages |
| System page | Ready | Shows dependency health and user management (role, activate/deactivate). It does **not** show queue depth — see below |
| Live queue depth | **Not yet started** | `ExecutionQueue.depth()` exists but is called from nowhere, so there is no way to watch the grading queue while a round runs. Do not expect it on the System page |

### Not yet started

Do not file bugs for these. They are known absences, not defects: gamification and
points beyond scoring, badges, certificates, practice mode outside a competition,
project or portfolio rounds, human judges and manual review, a live view of the
grading queue, and a publicly visible leaderboard (rankings still require signing
in — an anonymous request to the leaderboard is rejected).

In-app notifications **used to be on this list and are now built.** See the table
above.

### What the automated tests do and do not cover

This section has **changed substantially since the previous version of this
guide**, and every change is in your favour.

| | Status |
| --- | --- |
| CI runs the tests | **Yes, now.** `ci.yml` runs `pnpm lint`, `pnpm typecheck` and `pnpm test` on every pull request. A broken test blocks the merge. This was previously not the case |
| Backend unit tests | **31** `.spec.ts` files under `apps/api/src` |
| Frontend unit tests | **8** `.spec.ts` files under `apps/web/lib`, run by Jest. Previously there was no frontend test runner at all |

Still genuinely missing:

| Gap | Why it matters to you |
| --- | --- |
| No end to end tests | `pnpm test:e2e` is listed in `apps/api/package.json` but `apps/api/test/` **does not exist**, so the command fails. Do not report that as a new bug |
| No component or browser tests | The frontend tests cover helper functions in `apps/web/lib`, not rendered components or user flows. Every UI change is still verified by hand, which is a large part of why volunteer testing is valuable |
| No load or performance tests in CI | There is a load testing kit in `loadtest/`, but it is run by hand against a throwaway database, never in CI. See Section 6 |

---

## 8. Branching and contribution workflow

### The one rule that matters

> **`main` is changed only through a pull request that has been reviewed and
> merged. Nobody commits directly to `main`, including maintainers.**

This is not about trust. A push to `main` triggers a deployment to the live site
that people are using, and a pull request is the only point at which another
person sees the change first.

### Branches that exist right now

From `git branch` in the repository:

```
  feat/infra_deployment
  feat/load_test
  feat/notification_leaderboard
  feat/notifications
* feat/team_join_requests
  feat/ui_experiments
  fix/auth_form_usability
  fix/grading_resilience
  fix/rate_limit_handling
  fix/reweight_denominator
  fix/session_renewal
  fix/theme_toggle_system
  fix/ui_polish
  main
```

`*` marks the branch currently checked out on the machine this was generated from.
Each has a matching copy on GitHub (`origin/main` and so on). **Expect this list
to be wrong by the time you read it** — it grew from three branches to fourteen in
a fortnight. Run `git branch -a` yourself for the truth.

### Naming

Two prefixes are in use, and the list above shows both:

```
feat/team_join_requests      a new capability
fix/session_renewal          a correction to existing behaviour
```

The convention is a prefix, then a short description in `snake_case`. Keep it
short and descriptive. The branch name is the first thing a reviewer reads.

### The full workflow

If you have not done this before, follow it literally. It is the same six commands
every time.

```bash
# 1. Start from an up to date main. Never branch from a stale one.
git checkout main
git pull

# 2. Create your branch.
git checkout -b feat/your_change_here

# 3. Do the work, then see what you changed.
git status
git diff

# 4. Stage and commit. Name files explicitly rather than using `git add .`,
#    which sweeps up stray files you did not mean to include.
git add apps/web/components/thing.tsx
git commit -m "feat: add a thing to the dashboard"

# 5. Push. The -u is only needed the first time on a new branch.
git push -u origin feat/your_change_here

# 6. Open a pull request on GitHub. The push output prints a link.
```

### Commit messages

Start with a type, then a short description in the present tense:

```
feat: add resend button to the verification page
fix: stop the round timer drifting after a pause
docs: correct the setup steps for Windows
chore: bump prisma to 6.16.2
```

The first line should fit in about 70 characters. Put the detail in the body if
there is detail worth having.

### Before you open a pull request

```bash
pnpm lint         # style and common mistakes
pnpm typecheck    # type errors
pnpm test         # unit tests, both apps
```

All three should pass. **CI runs all three** on every pull request, and a red
check will block your merge. (An earlier version of this guide said CI skipped
the tests. That is no longer true — see Section 7.)

### What happens next

1. A maintainer reviews it. Expect comments. Review comments are about the code,
   not about you, and asking "why?" on one is completely normal.
2. Push more commits to the same branch to address feedback. The pull request
   updates itself.
3. Once approved it is merged into `main`, and the API redeploys automatically.

---

## 9. Environment setup

### 9.1 Before you start

| You need | Version | Check with | If missing |
| --- | --- | --- | --- |
| Node.js | 20.11 or newer | `node --version` | [nodejs.org](https://nodejs.org) |
| pnpm | 10.23.0 | `pnpm --version` | `npm install -g pnpm@10.23.0` |
| Docker Desktop | any recent | `docker --version` | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Git | any recent | `git --version` | [git-scm.com](https://git-scm.com) |

We use **pnpm**, not npm or yarn. Running `npm install` here will produce a
different dependency tree from everyone else's and cause confusing failures.
Docker must be **running**, not merely installed. Start Docker Desktop and wait
for it to say it is ready.

### 9.2 Get the code and install

```bash
git clone https://github.com/habibaadam/devArena_FaceOff.git
cd devArena_FaceOff
pnpm install
```

One install at the root covers both apps. That is what a monorepo buys you.

> **If the clone fails with `repository not found`**, the repository is private
> and your GitHub account has not been added to it yet. That is not a mistake on
> your part. Ask a maintainer to add you as a collaborator (Section 11), and send
> them your GitHub username.

### 9.3 Start the database and Redis

```bash
pnpm infra:up
```

This starts two Docker containers from `docker-compose.dev.yml`:

| Service | Port on your machine | Note |
| --- | --- | --- |
| PostgreSQL 16 | **5433** | Not the usual 5432, so it cannot clash with a Postgres you already run |
| Redis 7 | **6380** | Not the usual 6379, for the same reason |

Confirm both are up:

```bash
docker ps
```

You should see `faceoff-postgres` and `faceoff-redis`. Stop them later with
`pnpm infra:down`. Your data survives a stop, because it lives in a Docker volume.

> **Judge0 does not run locally.** `docker-compose.dev.yml` starts Postgres and
> Redis only. Code submissions will queue and then fail with `SYSTEM_ERROR`, and
> that is expected, not a bug you have found. Everything else works. If you need
> real code execution, ask a maintainer for access to the shared Judge0 instance
> (Section 11).

### 9.4 Configuration

Both apps read settings from a `.env` file that is **not** in git, because some of
those settings are secrets. Each app ships a `.env.example` showing what is
needed.

**Backend:**

```bash
cp apps/api/.env.example apps/api/.env
```

Then open `apps/api/.env` and set these:

```bash
DATABASE_URL="postgresql://faceoff:faceoff@localhost:5433/faceoff?schema=public"
DIRECT_URL="postgresql://faceoff:faceoff@localhost:5433/faceoff?schema=public"
REDIS_URL=redis://localhost:6380
```

Those credentials are the ones `docker-compose.dev.yml` creates. Port **5433**,
not 5432.

Generate two different random secrets:

```bash
openssl rand -base64 48    # run twice, paste into the two JWT_ lines
```

```bash
JWT_ACCESS_SECRET=<first value>
JWT_REFRESH_SECRET=<second, different value>
```

Then, for local development:

```bash
AUTH_SKIP_EMAIL_VERIFICATION=true   # skips the email step entirely
MAIL_DRIVER=console                 # prints emails to the terminal
COOKIE_DOMAIN=                      # MUST stay empty locally
```

> **`COOKIE_DOMAIN` must be empty on your machine.** If you set it to a real
> domain while browsing `localhost`, your browser silently discards the sign-in
> cookie. The symptom is a maddening loop: you sign in, you reach the dashboard,
> and you are thrown straight back to the login page. This has cost real debugging
> time. Leave it blank.

> **The file is read once, at startup.** Changing `.env` while the server is
> running does nothing, even with `--watch`. Restart it.

**Frontend:**

```bash
cp apps/web/.env.example apps/web/.env.local
```

The default (`NEXT_PUBLIC_API_URL=http://localhost:4000`) is correct for local
work. No trailing slash.

There is a second setting, `NEXT_PUBLIC_GOOGLE_SIGN_IN`, which decides whether
the "Continue with Google" button is drawn on the first paint. **Leave it
`false`** unless you have been given Google credentials. The API's
`/auth/providers` endpoint is authoritative and corrects a wrong value within one
request, so this is a hint rather than a switch.

> **Google sign-in does not work locally by default.** It needs
> `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` in
> `apps/api/.env`, and those are real credentials tied to registered redirect
> URLs. Without them the button is simply hidden — that is correct behaviour, not
> a bug. Register with email and password instead, or ask a maintainer
> (Section 11).

### 9.5 Build the database

```bash
pnpm --filter api exec prisma generate   # generate the typed client
pnpm db:migrate                          # create the tables
pnpm db:seed                             # add sample data
```

`prisma generate` reads `schema.prisma` and writes a TypeScript client from it. Run
it again any time the schema changes, or you will get type errors about fields
that plainly exist.

### 9.6 Run it

```bash
pnpm dev
```

Starts both apps together:

| App | URL |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:4000 |

Check the API is alive:

```bash
curl http://localhost:4000/health/live
```

> **Ports 3000 and 4000 may already be taken.** The project maintainer runs
> servers on those ports. If you are working on a shared machine, or `pnpm dev`
> reports a port in use, **do not kill the process**. Use a different port:
> `pnpm --filter web exec next dev -p 3200`. If you do, also point the frontend at
> the right API by setting `NEXT_PUBLIC_API_URL` to match, or the browser will
> report that it cannot reach the server.

### 9.7 Useful commands

```bash
pnpm dev             # both apps
pnpm test            # backend tests
pnpm lint            # linter
pnpm typecheck       # type errors
pnpm infra:up        # start Postgres and Redis
pnpm infra:down      # stop them
pnpm db:migrate      # apply new migrations
pnpm db:seed         # reseed sample data
pnpm --filter api exec prisma studio    # browse the database in a GUI
```

`prisma studio` opens a table browser in your web browser. It is the fastest way
to see what the app actually wrote.

### 9.8 When it goes wrong

| Symptom | Cause and fix |
| --- | --- |
| `P1001: Can't reach database server` | Postgres is not running (`pnpm infra:up`), or `DATABASE_URL` says 5432 instead of **5433** |
| Sign in loops back to the login page | `COOKIE_DOMAIN` is set. Empty it, then **restart the server** |
| Type errors about fields that exist | Run `pnpm --filter api exec prisma generate` |
| `EADDRINUSE` | Something already holds the port. Use another one. Do not kill it |
| Submissions stick on `QUEUED`, then `SYSTEM_ERROR` | Expected. Judge0 does not run locally (9.3) |
| `pnpm test:e2e` fails immediately | Known. That directory does not exist (Section 7) |
| Odd build errors in `apps/web` | A `next dev` and a `next build` sharing one `.next` folder. Stop the dev server first |

---

## 10. Glossary

**API** (Application Programming Interface). The backend. A program with no
screen that answers requests from the frontend. Ours is the NestJS app.

**bcrypt.** A deliberately slow password hashing algorithm. Slowness is the
feature: it makes guessing passwords from a stolen database expensive.

**BullMQ.** The library that manages our job queue, storing jobs in Redis. See
*queue*.

**CI** (Continuous Integration). Automatic checks that run on every pull request.
Ours runs lint and typecheck. See Section 7 for what it does not run.

**CORS** (Cross Origin Resource Sharing). A browser rule that stops a page on one
domain from calling a different domain unless that domain permits it. If the
frontend cannot reach the API, this is often why.

**Docker.** Runs software in isolated containers, so you get exactly our Postgres
version without installing Postgres.

**ECR / ECS / EC2.** Amazon services. EC2 is a rented Linux server, ECR stores
Docker images, ECS runs containers. Our API runs on EC2.

**Environment variable.** A setting read from outside the code, kept in `.env`, so
secrets stay out of git and settings can differ between your machine and
production.

**Hydration.** The moment React takes over HTML that arrived from the server and
makes it interactive. A "hydration error" means the server and browser produced
different HTML.

**Judge0.** The open source sandbox that compiles and runs submitted code with
limits on time, memory and processes, and no network access.

**JWT** (JSON Web Token). A signed token proving who you are. Ours lives in a
cookie and expires after 15 minutes. See *refresh token*.

**Lint.** Automated style and mistake checking. `pnpm lint`.

**Migration.** A file of SQL that moves the database from one shape to the next.
They are numbered and run in order, so every machine ends up identical.
`apps/api/prisma/migrations/`.

**Monorepo.** One repository holding several applications. Ours holds `apps/api`
and `apps/web`, sharing one install and one lockfile.

**ORM** (Object Relational Mapper). Lets you query the database in TypeScript
instead of raw SQL. Ours is Prisma.

**pnpm.** Our package manager. Not interchangeable with npm or yarn here.

**PostgreSQL / Postgres.** The database.

**Prisma.** Our ORM. `schema.prisma` defines every table, and `prisma generate`
turns it into typed TypeScript.

**Pull request (PR).** A request to merge your branch into another, with a page
for review and discussion. The only route into `main`.

**Queue.** A list of jobs waiting to be processed. Lets the API answer immediately
and do slow work afterwards. See Section 4.2.

**Redis.** A fast in memory data store. We use it to hold the queue.

**Refresh token.** A longer lived token (7 days) used to obtain a new access token
without signing in again. Stored hashed, and rotated on each use.

**Sandbox.** A restricted environment where untrusted code can run without
reaching the rest of the system.

**Seed.** Sample data inserted into an empty database so the app is usable
immediately. `pnpm db:seed`.

**SSR** (Server Side Rendering). Building the HTML on the server before sending
it, so the first paint is fast and does not wait for JavaScript.

**Tailwind CSS.** Styling by composing small utility classes in the markup rather
than writing separate stylesheets.

**Typecheck.** Verifying those types without running anything. `pnpm typecheck`.

**TypeScript.** JavaScript with types. Catches whole categories of mistakes before
the code runs.

---

## 11. Getting help and reporting issues

### Before reporting

1. Check Section 7. It may be a known gap rather than a bug.
2. Check 9.8. Most setup problems are there.
3. Try once more from a fresh reload, and note whether it happens every time.

### A good bug report

Include all six. A report missing the first three usually cannot be acted on.

```
What I did:        Step by step, so someone else can repeat it.
What I expected:
What happened:
Where:             Local, or faceoff.akwannya-hub.org
Browser and OS:    e.g. Chrome 130 on Windows 11
Evidence:          Screenshot, and any red text from the browser console
                   (F12, then the Console tab)
```

"How often" is worth adding when it matters: every time, or once out of ten.
An intermittent bug is a different investigation from a reliable one.

### Where to send it

- **A bug in the product:** open a GitHub issue on the repository.
- **A problem with your setup:** ask in the team chat. Paste the full error text,
  not a screenshot of it, so it can be searched.
- **Access to Judge0, or something from the internal `docs/` folder:** ask a
  maintainer directly.

> **Never paste a token, password, or the contents of a `.env` file** into an
> issue or a chat message. If you think you have leaked one, say so immediately.
> Rotating a secret is routine. A quietly leaked one is not.

### Who to contact

Maintainer: **habibaadam** on GitHub, the owner of this repository.

*This section is deliberately thin because the project's contact channels are not
recorded anywhere in the repository. A maintainer should fill in the chat platform,
the issue triage owner and the expected response time.*

---

## Appendix: about this document

Written for volunteers and assistants joining the Face-Off project.

Every factual claim was verified against the repository, the live deployment, or
git output on **13 October 2026**. Version numbers come from the `package.json`
files, routes from the source tree, and branches from `git branch`. Anything that
could not be verified is marked as such in place.

### What changed in the 13 October revision

The previous revision was written on 30 September. In the two weeks between, three
features shipped and the test setup changed, so several claims had gone stale:

- **Password reset is finished.** It was listed as "no page in the UI"; both
  `/forgot-password` and `/reset-password` now exist.
- **Sign in with Google** shipped and was missing entirely.
- **In-app notifications** shipped. They were in the "not yet started" list.
- **Team join requests** shipped.
- **CI now runs the tests.** The old guide said it ran lint and typecheck only,
  and warned that a broken test could merge. That warning no longer applies.
- **The frontend has tests now** — Jest, 8 files in `apps/web/lib`. The old guide
  said there was no frontend test runner.
- Backend test count went from 22 to **31**.
- **Round editing is finished.** The old guide said only pause and end were
  exposed; the full `PATCH /rounds/:id` form now exists, along with weight
  changes, delete, finalize, unlock and archive.
- **The System page claim was wrong.** It shows dependency health and user
  management; it has never shown queue depth, and there is still no live view of
  the grading queue.
- The branch list went from 3 branches to 14.
- A `loadtest/` kit and a performance report were added at the repository root.
- The database's distance from the API is now measured and documented, because it
  makes the live site visibly slower than a local setup.

Unchanged and re-verified: all version numbers, the local ports (5433 and 6380),
the `COOKIE_DOMAIN` trap, Judge0 not running locally, `pnpm test:e2e` still
failing because `apps/api/test/` does not exist, and challenge content still not
being editable after creation.

If something here is wrong or out of date, correcting it is a genuinely useful
first contribution, and the workflow in Section 8 is how you do it.

**There is also a PDF.** This Markdown file is the source of truth. The PDF is
generated from it and is not kept in git, so edit the Markdown and rebuild:

```bash
python3 tools/build_onboarding_pdf.py
```

That needs Python 3 and a Chromium based browser (Brave, Chrome or Edge), which
does the rendering.