variable "aws_region" {
  description = "AWS region where the state bucket and lock table will be created."
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID. Used to scope IAM and bucket policies."
  type        = string
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for Terraform remote state."
  type        = string
}

variable "lock_table_name" {
  description = "DynamoDB table name used for Terraform state locking."
  type        = string
  default     = "akwannya-faceoff-tflock"
}

variable "project" {
  description = "Short project identifier. Used as a tag on every resource."
  type        = string
  default     = "faceoff"
}

variable "environment" {
  description = "Deployment environment (e.g. production, staging)."
  type        = string
  default     = "production"
}
