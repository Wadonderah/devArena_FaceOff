# Infrastructure Investigation Report

**Project:** devArena_FaceOff  
**Date:** Investigation conducted against `main` branch + remote branches  
**Question:** Is there any Infrastructure-as-Code (Terraform, Pulumi, CDK, etc.) in this repo, or is infrastructure managed via console clicking?

---

## Summary Answer

**There is no Infrastructure-as-Code in this repository.** All cloud infrastructure (AWS EC2 instance, ECR registry, IAM roles, SSM, Aiven PostgreSQL, Vercel hosting) appears to have been created manually via the AWS console, Aiven console, and Vercel dashboard. The repository contains a deployment pipeline that _uses_ already-provisioned infrastructure, but nothing that _creates_ or _manages_ it.

---

## Evidence

### 1. No IaC files found anywhere in the repo

The following file types were searched across the entire repository (excluding `.git/`). None were found:

| IaC Tool | File patterns searched | Found? |
|---|---|---|
| Terraform | `*.tf`, `*.tfvars`, `terraform.tfstate`, `.terraform/` | ❌ None |
| Pulumi | `Pulumi.yaml` | ❌ None |
| AWS CDK | `cdk.json`, CDK constructs | ❌ None |
| CloudFormation | `*.yaml`/`*.json` with `AWSTemplateFormatVersion` | ❌ None |
| Serverless Framework | `serverless.yml` | ❌ None |
| Helm / Kubernetes | `Chart.yaml`, `*.yaml` manifests | ❌ None |

No `infra/` or `infrastructure/` directories exist.

### 2. The deploy workflow assumes pre-existing infrastructure

`.github/workflows/deploy.yml` performs these steps on a push to `main`:

1. Authenticates to AWS via OIDC using a role ARN stored in a GitHub variable (`vars.AWS_ROLE_ARN`) — the IAM role was created manually.
2. Logs into ECR and pushes a Docker image tagged with the commit SHA.
3. Sends an AWS SSM `AWS-RunShellScript` command to a specific EC2 instance ID (`vars.INSTANCE_ID`) to pull the new image and restart the container.
4. Polls `https://api.akwannya-hub.org/health/live` to confirm the deploy succeeded.

None of these steps provision or configure infrastructure — they operate against infrastructure that already exists. The EC2 instance, ECR repository, IAM role, and SSM configuration are all assumed to be in place before the pipeline runs.

**Relevant lines from `.github/workflows/deploy.yml`:**
```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ vars.AWS_ROLE_ARN }}
    aws-region: ${{ vars.AWS_REGION }}

- name: Tell the instance to pull and restart
  run: |
    CMD_ID=$(aws ssm send-command \
      --instance-ids "${{ vars.INSTANCE_ID }}" \
      ...)
```

### 3. CI workflow has no IaC involvement

`.github/workflows/ci.yml` runs lint, typecheck, and tests only. No infrastructure operations.

### 4. The `feat/infra_deployment` remote branch contains no IaC

There is a remote branch named `origin/feat/infra_deployment`. Diffing it against `main` reveals only application code changes (NestJS modules, Next.js pages, auth features, notifications). No Terraform, CDK, or other IaC files appear in the diff.

### 5. `docker-compose.dev.yml` is local-only

`docker-compose.dev.yml` starts Postgres 16 and Redis 7 for local development only — it does not represent production infrastructure and has no cloud component.

### 6. Infrastructure is spread across three external platforms — all console-managed

As documented in `ONBOARDING.md` (Section 4.1) and confirmed by `apps/api/.env.example`:

| Component | Platform | How provisioned |
|---|---|---|
| API server | AWS EC2 (single instance, Virginia region) | Console (assumed — no IaC) |
| Container registry | AWS ECR (`faceoff-api` repository) | Console (assumed) |
| IAM / OIDC | AWS IAM | Console (assumed) |
| SSM agent | AWS SSM | Pre-installed on the EC2 instance |
| Reverse proxy / TLS | Caddy on the EC2 instance | Manual config on the box |
| Database | Aiven managed PostgreSQL (free tier, India region) | Aiven console (assumed) |
| Frontend hosting | Vercel | Vercel dashboard (assumed) |
| Email delivery | Resend | Resend dashboard (assumed) |
| Code execution sandbox | Judge0 CE on the same EC2 instance | Manual setup (assumed) |

The `ONBOARDING.md` explicitly notes: *"If you need real code execution, ask a maintainer for access to the shared Judge0 instance"* — further confirming that Judge0 was set up manually and access is managed out-of-band.

### 7. Known performance issue is a direct consequence of manual provisioning

`ONBOARDING.md` Section 4.1 documents a 216ms latency between the EC2 instance (Virginia) and the Aiven database (India), resulting in ~2.4s response times for MCQ answers. A proper IaC setup would encode the co-location requirement as a constraint. The mismatch exists because each service was provisioned independently through separate consoles.

---

## Conclusions

1. **Zero IaC coverage.** If the EC2 instance is terminated, the ECR repository is deleted, or the IAM role is misconfigured, there is no code to recreate them. Recovery requires manual re-clicking through AWS consoles and reconfiguring the box by hand.

2. **The deployment pipeline is well-built but the infrastructure it targets is undocumented.** The GitHub Actions workflow is clean — OIDC auth, SHA-tagged images, SSM-based zero-downtime restarts, health-check confirmation — but all of this is useless if the underlying instance doesn't exist.

3. **No drift detection.** There is no way to know if someone has made ad-hoc changes to the EC2 instance's security groups, IAM policies, or Caddy configuration. The running state and the "intended" state only exist in one person's memory.

---

## Recommendations

These are ordered by impact, not effort.

### Immediate (low effort, high value)

**1. Write a `docs/infrastructure.md` runbook.** Document every manually-created resource: the EC2 instance size, region, AMI, security groups, the ECR repo name and lifecycle rules, the IAM role and its trust policy, the Caddy config, the Judge0 installation steps, the Aiven tier and region. This costs one afternoon and is the minimum viable protection against "we lost access to the AWS account" or "the maintainer who set this up leaves."

**2. Store GitHub Actions variables in the repo wiki or README note.** The variables `AWS_ROLE_ARN`, `AWS_REGION`, `AWS_ACCOUNT_ID`, and `INSTANCE_ID` are referenced in `deploy.yml` but live only in GitHub repository settings. Document their current values (ARNs, IDs) alongside the runbook.

### Medium term (moderate effort, high value)

**3. Write Terraform for the AWS side.** The footprint is small: one EC2 instance, one ECR repository, one IAM role with an OIDC trust policy, security groups. A Terraform module for this is roughly 100–150 lines. Suggested structure:
```
infra/
  terraform/
    main.tf          # provider, EC2, ECR
    iam.tf           # OIDC provider + deploy role
    security.tf      # security groups
    variables.tf
    outputs.tf
    terraform.tfvars.example
```

**4. Commit the Caddy configuration and Judge0 setup as an Ansible playbook or cloud-init script.** The EC2 instance has manual configuration that is currently invisible to the repo. Even a single `infra/bootstrap.sh` that documents the exact commands used to install Caddy, set up Judge0, and wire up the Docker Compose prod file would be a major improvement over the current nothing.

### Longer term

**5. Move the database to the same AWS region as the EC2 instance.** As documented in `ONBOARDING.md` and measured in `loadtest/PERFORMANCE-REPORT.md`, the Virginia–India latency causes ~2.4s MCQ response times. An RDS PostgreSQL instance in `us-east-1` would bring this to under 5ms. This is both a performance fix and an opportunity to bring the database under IaC control.

**6. Consider moving to a PaaS for the frontend (already done: Vercel) and a managed container service (ECS Fargate or Fly.io) for the API.** The current single-EC2 setup requires manual box maintenance. A container service would eliminate the SSM-based deploy dance and make rollbacks trivial.
