# 🏗️ FaceOff Infrastructure

<div align="center">

## Software Engineering Face-Off

**Platform:** akwannya-hub.org  
**Date completed:** October 17, 2026  
**Engineer:** Wadonderah A. Collins

</div>

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Infrastructure as Code](#3-infrastructure-as-code)
4. [Phase 0 — Terraform State Backend](#4-phase-0--terraform-state-backend)
5. [Phase 1 — RDS Provisioning](#5-phase-1--rds-provisioning)
6. [Phase 2 — Aiven to RDS Data Migration](#6-phase-2--aiven-to-rds-data-migration)
7. [Resource Inventory](#7-resource-inventory)
8. [Runbook — Day-to-Day Operations](#8-runbook--day-to-day-operations)
9. [Secrets and Credentials](#9-secrets-and-credentials)
10. [Known Gaps and Future Work](#10-known-gaps-and-future-work)

---

## 1. Overview

This document describes the complete infrastructure for the FaceOff platform as of October 2026. It covers:

- What infrastructure exists, where it runs, and how it was created
- The Terraform codebase that now manages cloud resources
- The Aiven → RDS database migration that resolved a 2.4-second MCQ response time
- Operational runbooks for common tasks

### Background

Prior to this work, all infrastructure was provisioned manually through the AWS console, Aiven console, and Vercel dashboard. There was no infrastructure-as-code, no documented runbook, and no way to reproduce the environment from the repository. The database (Aiven PostgreSQL, hosted in India) was 216ms away from the API server (AWS EC2, Virginia), causing every MCQ submission to take approximately 2.4 seconds due to sequential database round trips.

This work introduced Terraform for infrastructure management and migrated the database to AWS RDS in the same availability zone as the EC2 instance, reducing latency to under 5ms.

---

## 2. Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                        Internet                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │     Vercel      │
              │  faceoff.       │
              │  akwannya-hub.  │
              │  org            │
              └────────┬────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│           AWS EC2  i-05561a750311d030a                     │
│           t3.medium · us-east-1b · 172.31.26.81             │
│                                                             │
│   ┌─────────┐   ┌──────────────┐   ┌────────────────────┐  │
│   │  Caddy  │──▶│  NestJS API  │──▶│   Redis (BullMQ)   │  │
│   │ (HTTPS) │   │  port 4000   │   │   port 6380        │  │
│   └─────────┘   └──────┬───────┘   └────────────────────┘  │
│                        │                     │              │
│                        │           ┌─────────▼────────────┐ │
│                        │           │  Execution Worker    │ │
│                        │           │  (same process)      │ │
│                        │           └─────────┬────────────┘ │
│                        │                     │              │
│                  ┌─────▼─────────────────────▼────────────┐ │
│                  │           Judge0 CE                    │ │
│                  │           port 2358                    │ │
│                  └────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │ PostgreSQL (VPC-internal, port 5432)
┌──────────────────────▼──────────────────────────────────────┐
│           AWS RDS PostgreSQL 18.6                           │
│           faceoff-production-postgres                       │
│           db.t4g.micro · us-east-1b · private              │
└─────────────────────────────────────────────────────────────┘
```

### Key design decisions

| Decision | Reason |
|---|---|
| RDS in `us-east-1b` | Same AZ as EC2 — eliminates cross-AZ latency and data transfer charges |
| `PubliclyAccessible = false` | RDS is only reachable from within the VPC |
| Inbound rule references SG, not CIDR | Rule stays correct if EC2 IP changes |
| `db.t4g.micro` | Sufficient for current load (pool of 5, ~110 max connections) |
| `storage_encrypted = true` | Encryption at rest, no performance cost on gp3 |
| `deletion_protection = true` | Prevents accidental destruction via Terraform |
| `skip_final_snapshot = false` | A snapshot is taken before any destroy operation |
| `backup_retention_period = 7` | Matches what Aiven provided |

---

## 3. Infrastructure as Code

All infrastructure is managed with Terraform. The code lives in `infra/` in this repository.

```text
infra/
├── bootstrap/                      Phase 0 — Terraform state backend (run once)
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── terraform.tfvars.example
│   └── README.md
│
├── modules/
│   └── rds/                        Reusable RDS module
│       ├── main.tf                 Security group + subnet group + RDS instance
│       ├── variables.tf
│       └── outputs.tf
│
└── environments/
    └── production/                 Production environment
        ├── backend.tf              Remote state config
        ├── main.tf                 Calls the rds module
        ├── variables.tf
        ├── outputs.tf
        └── terraform.tfvars.example
```

### Design principles

- **No hardcoded values.** Every `.tf` file uses `var.*`. All environment-specific values live in `terraform.tfvars` which is in `.gitignore` and never committed.
- **Reusable modules.** The `modules/rds/` module knows nothing about production. It takes inputs and creates resources. A staging environment would call the same module with different values.
- **Remote state.** Both `bootstrap/` and `environments/production/` store state in S3 with DynamoDB locking. State never lives on a developer's machine.
- **Sensitive variables marked.** `db_username` and `db_password` are marked `sensitive = true` in Terraform, preventing them from appearing in plan/apply output.

---

## 4. Phase 0 — Terraform State Backend

### What was created

| Resource | Name | Purpose |
|---|---|---|
| S3 bucket | `akwannya-faceoff-tfstate` | Stores all Terraform state files |
| DynamoDB table | `akwannya-faceoff-tflock` | State locking — prevents concurrent applies |

### S3 bucket configuration

- Versioning: enabled (allows rollback to previous state)
- Encryption: AES256 server-side
- Public access: fully blocked
- `prevent_destroy`: lifecycle rule prevents accidental deletion

### State file layout

```text
s3://akwannya-faceoff-tfstate/
├── bootstrap/terraform.tfstate          ← bootstrap module state
└── environments/production/terraform.tfstate   ← production state
```

### How to work with it

```bash
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars   # fill in values
terraform init
terraform plan
terraform apply
```

The bootstrap module was itself imported into remote state after creation:

```bash
terraform import aws_s3_bucket.terraform_state akwannya-faceoff-tfstate
terraform import aws_dynamodb_table.terraform_lock akwannya-faceoff-tflock
terraform init -migrate-state   # moved local state to S3
```

---

## 5. Phase 1 — RDS Provisioning

### What was created

| Resource | Name/ID | Details |
|---|---|---|
| Security group | `faceoff-production-rds-sg` / `sg-07ab38e0c2d8666a1` | Inbound TCP 5432 from `sg-0a8ab10eb6f050468` only |
| DB subnet group | `faceoff-production-rds-subnet-group` | Spans `us-east-1a` and `us-east-1b` |
| RDS instance | `faceoff-production-postgres` | PostgreSQL 18.6, `db.t4g.micro`, `us-east-1b` |

### RDS instance details

| Setting | Value |
|---|---|
| Identifier | `faceoff-production-postgres` |
| Engine | PostgreSQL 18.6 |
| Instance class | `db.t4g.micro` (2 vCPU / 1 GB) |
| Storage | 20 GB gp3, encrypted |
| AZ | `us-east-1b` (same as EC2) |
| VPC | `vpc-0870e3d690a7f098d` |
| Publicly accessible | No |
| Multi-AZ | No |
| Backup retention | 7 days |
| Deletion protection | Enabled |
| Endpoint | `faceoff-production-postgres.cixemc4u41ow.us-east-1.rds.amazonaws.com:5432` |

### Network security

The RDS security group (`faceoff-production-rds-sg`) allows inbound PostgreSQL (TCP 5432) only from the EC2 instance's security group (`judge0-host-sg` / `sg-0a8ab10eb6f050468`). No CIDR ranges are used. This means:

- The database is not reachable from the internet
- The database is not reachable from other resources in the VPC
- Only the EC2 app server can connect

### How to apply changes

```bash
cd infra/environments/production
cp terraform.tfvars.example terraform.tfvars   # fill in values
terraform init
terraform plan
terraform apply
```

---

## 6. Phase 2 — Aiven to RDS Data Migration

### Problem

The production database was hosted on Aiven (free tier, India region). The EC2 API server is in AWS `us-east-1` (Virginia). The round-trip latency was 216ms, causing MCQ submissions (which make ~11 sequential DB queries) to take approximately **2.4 seconds** per answer.

### Solution

Migrate to a private RDS PostgreSQL instance in `us-east-1b` — the same availability zone as the EC2 instance. Same-AZ RDS latency is under 1ms, reducing MCQ response time to approximately **55ms**.

### Migration steps executed

#### 1. Verify RDS was provisioned

```bash
terraform output
# rds_endpoint = "faceoff-production-postgres.cixemc4u41ow.us-east-1.rds.amazonaws.com:5432"
```

#### 2. SSH into EC2

```bash
ssh -i ~/.ssh/judgezerokeypair.pem ec2-user@100.31.157.127
```

#### 3. Dump from Aiven using a Postgres 18 container

The EC2 host has no `pg_dump` installed. The only Postgres client available (inside the Judge0 container) is version 16, which cannot dump a version 18.6 server. A matching client was pulled via Docker:

```bash
cd /opt/faceoff

docker run --rm -v "$PWD:/out" postgres:18 \
  pg_dump "<AIVEN_URL>" \
  -Fc -f /out/faceoff.dump

ls -lh /opt/faceoff/faceoff.dump
# -rw-r--r--. 1 root root 190K Oct 17 12:05 /opt/faceoff/faceoff.dump
```

#### 4. Restore into RDS

```bash
docker run --rm -v "$PWD:/in" postgres:18 \
  pg_restore \
  -d "<RDS_URL>" \
  --no-owner --no-privileges \
  /in/faceoff.dump
```

`--no-owner --no-privileges` was required because the Aiven role (`avnadmin`) does not exist on RDS.

#### 5. Verify the restore

```bash
# Confirm all 26 tables exist
docker run --rm postgres:18 psql "<RDS_URL>" -c "\dt"

# Confirm row counts
docker run --rm postgres:18 psql "<RDS_URL>" -c \
  "select (select count(*) from users) users,
          (select count(*) from competitions) competitions,
          (select count(*) from submissions) submissions,
          (select count(*) from score_events) score_events;"
```

Results:

| Table | Count |
|---|---|
| users | 22 |
| competitions | 11 |
| submissions | 73 |
| score_events | 60 |

#### 6. Verify Prisma schema

```bash
docker run --rm \
  -e DATABASE_URL="<RDS_URL>" \
  -e DIRECT_URL="<RDS_URL>" \
  --entrypoint npx \
  $(docker images --format "{{.Repository}}:{{.Tag}}" | grep faceoff-api | head -1) \
  prisma migrate status
# → Database schema is up to date!  (13 migrations)
```

#### 7. Cutover

Updated `/opt/faceoff/api.env` on the EC2 box:

```bash
sudo sed -i 's|^DATABASE_URL=.*|DATABASE_URL=<RDS_URL>|' /opt/faceoff/api.env
sudo sed -i 's|^DIRECT_URL=.*|DIRECT_URL=<RDS_URL>|' /opt/faceoff/api.env

# Verify
grep -E "DATABASE_URL|DIRECT_URL" /opt/faceoff/api.env
```

Restarted the container with `--force-recreate` (required for env file changes):

```bash
cd /opt/faceoff
docker compose up -d --force-recreate api
```

> **Note:** `docker compose restart` reuses the existing container environment and does not pick up env file changes. Always use `up -d --force-recreate` when changing `api.env`.

#### 8. Confirmation

```bash
docker logs faceoff-api-1 --tail 30
# [PrismaService] Database connection established
# [NestApplication] Nest application successfully started
# [Bootstrap] API listening on port 4000

curl -s https://api.akwannya-hub.org/health/live | jq
# { "status": "ok", "uptime": 128.279668765 }
```

#### 9. Cleanup

```bash
sudo rm /opt/faceoff/faceoff.dump
```

### Post-migration note

Aiven is left running and untouched. Do not decommission it until RDS has been stable for several days.

---

## 7. Resource Inventory

### AWS resources

| Resource | ID / Name | Notes |
|---|---|---|
| EC2 instance | `i-05561a750311d030a` | t3.medium, us-east-1b, Amazon Linux 2023 |
| EC2 public IP | `100.31.157.127` | May change on stop/start — use DNS |
| EC2 private IP | `172.31.26.81` | Static within VPC |
| EC2 security group | `sg-0a8ab10eb6f050468` / `judge0-host-sg` | Controls inbound to EC2 |
| ECR repository | `faceoff-api` | Docker images, SHA-tagged |
| IAM role | OIDC role for GitHub Actions | Used by `deploy.yml` |
| VPC | `vpc-0870e3d690a7f098d` | Default VPC, `172.31.0.0/16` |
| Subnet (EC2 + RDS) | `subnet-0714ec469ac659037` | `us-east-1b` |
| RDS instance | `faceoff-production-postgres` | PostgreSQL 18.6, `db.t4g.micro` |
| RDS endpoint | `faceoff-production-postgres.cixemc4u41ow.us-east-1.rds.amazonaws.com` | Port 5432 |
| RDS security group | `sg-07ab38e0c2d8666a1` / `faceoff-production-rds-sg` | Managed by Terraform |
| DB subnet group | `faceoff-production-rds-subnet-group` | Managed by Terraform |
| S3 state bucket | `akwannya-faceoff-tfstate` | Managed by Terraform |
| DynamoDB lock table | `akwannya-faceoff-tflock` | Managed by Terraform |

### External services

| Service | Purpose | Provider |
|---|---|---|
| Vercel | Frontend hosting | vercel.com |
| Resend | Transactional email | resend.com |
| Aiven PostgreSQL | Previous database (keep running) | aiven.io |
| Google OAuth | Social sign-in | console.cloud.google.com |

---

## 8. Runbook — Day-to-Day Operations

### Deploy the API

Automatic on every push to `main` that changes files under `apps/api/**`. The GitHub Actions workflow in `.github/workflows/deploy.yml`:

1. Authenticates to AWS via OIDC
2. Builds and pushes the Docker image to ECR (tagged with commit SHA)
3. Sends an SSM command to the EC2 instance to pull and restart
4. Polls `/health/live` to confirm the deploy succeeded

To trigger manually: **Actions → Deploy API → Run workflow** on GitHub.

### SSH into the EC2 instance

```bash
ssh -i ~/.ssh/judgezerokeypair.pem ec2-user@100.31.157.127
```

Key file: `judgezerokeypair.pem` — store in `~/.ssh/`, permissions must be `400`.

### View API logs

```bash
# On the EC2 box
docker logs faceoff-api-1 --tail 50 --follow
```

### Restart the API

```bash
# On the EC2 box
cd /opt/faceoff
docker compose up -d --force-recreate api
```

### Update an environment variable

```bash
# On the EC2 box
sudo vi /opt/faceoff/api.env
cd /opt/faceoff
docker compose up -d --force-recreate api
```

### Apply Terraform changes

```bash
cd infra/environments/production
terraform plan    # always review before applying
terraform apply
```

### Connect to RDS directly (for debugging)

RDS is not publicly accessible. Connect through the EC2 box:

```bash
# On the EC2 box
docker run --rm -it postgres:18 psql "<RDS_URL>"
```

### Check health

```bash
curl -s https://api.akwannya-hub.org/health/live | jq
curl -s https://api.akwannya-hub.org/health | jq
```

---

## 9. Secrets and Credentials

> **Rule:** No secrets are committed to this repository. All sensitive values live in `terraform.tfvars` (gitignored), `/opt/faceoff/api.env` (on the EC2 box), and GitHub repository secrets/variables.

### GitHub Actions variables (repository settings)

| Variable | Description |
|---|---|
| `AWS_ROLE_ARN` | ARN of the OIDC IAM role for deployments |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCOUNT_ID` | `163088933322` |
| `INSTANCE_ID` | `i-05561a750311d030a` |

### EC2 environment file (`/opt/faceoff/api.env`)

Contains all runtime secrets for the API: database credentials, JWT secrets, Google OAuth credentials, Resend API key, Judge0 token. This file is never in the repository. If the EC2 instance is replaced, this file must be recreated manually or from a secure secrets store.

### Terraform variables (`terraform.tfvars`)

Contains RDS master username, password, and AWS account details. Never committed. If lost, the RDS password can be rotated in the AWS console and updated in `api.env`.

### SSH key

`judgezerokeypair.pem` — the EC2 key pair private key. Store in `~/.ssh/` with `chmod 400`. This key cannot be recovered from AWS if lost. If lost, access via AWS SSM Session Manager is still possible:

```bash
aws ssm start-session --target i-05561a750311d030a --region us-east-1
```

---

## 10. Known Gaps and Future Work

These are not defects — they are known absences documented so the next engineer knows what exists and what does not.

| Gap | Risk | Recommended action |
|---|---|---|
| EC2 instance not in Terraform | If the instance is terminated, there is no code to recreate it | Import into Terraform (Phase 1 import, deferred) |
| ECR repository not in Terraform | Same risk | Import alongside EC2 |
| IAM OIDC role not in Terraform | Same risk | Import alongside EC2 |
| No EC2 bootstrap script | The Caddy config, Judge0 setup, and Docker Compose wiring on the box exist only as manual configuration | Write a `infra/bootstrap.sh` or Ansible playbook |
| Aiven still running | Paying for two databases temporarily | Decommission after RDS is stable for several days |
| Single EC2 instance | No redundancy — if the instance goes down, the site is down | Out of scope for now |
| No staging environment | All testing happens against production | Add `infra/environments/staging/` calling the same modules |
| SSH key not rotated | `judgezerokeypair.pem` age unknown | Create a new key pair, update the instance, retire the old key |
