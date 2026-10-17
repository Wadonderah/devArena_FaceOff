# Terraform Bootstrap

**Run this once.** Creates the S3 bucket and DynamoDB table that store Terraform state for the main infrastructure.

## Prerequisites

- AWS CLI configured with credentials (`aws sts get-caller-identity` works)
- Terraform >= 1.9.0 installed

## Steps

```bash
cd infra/bootstrap

# 1. Copy the example and fill in your values (already done if you see terraform.tfvars)
cp terraform.tfvars.example terraform.tfvars

# 2. Initialize Terraform
terraform init

# 3. Preview what will be created
terraform plan

# 4. Create the bucket and table
terraform apply

# 5. Note the outputs — you'll need them for Phase 1
terraform output
```

## What gets created

- **S3 bucket** `akwannya-faceoff-tfstate` in `us-east-1`
  - Versioning enabled
  - AES256 encryption
  - Public access blocked
  - `prevent_destroy` lifecycle rule (cannot be deleted by `terraform destroy`)

- **DynamoDB table** `akwannya-faceoff-tflock` in `us-east-1`
  - Pay-per-request billing
  - Used for state locking (prevents concurrent applies)
  - `prevent_destroy` lifecycle rule

## After this completes

Copy the bucket and table names from `terraform output` into `infra/live/backend.tf` (Phase 1).
