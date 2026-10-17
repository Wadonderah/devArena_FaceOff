variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID."
  type        = string
}

variable "project" {
  description = "Short project identifier."
  type        = string
}

variable "environment" {
  description = "Deployment environment."
  type        = string
}

# ── Network ───────────────────────────────────────────────────────────────────

variable "vpc_id" {
  description = "VPC ID where all resources live."
  type        = string
}

variable "ec2_security_group_id" {
  description = "Security group ID of the EC2 app server (judge0-host-sg)."
  type        = string
}

variable "rds_subnet_ids" {
  description = "Subnet IDs for the RDS DB subnet group. Must span at least two AZs."
  type        = list(string)
}

variable "rds_preferred_az" {
  description = "AZ to place the RDS instance in."
  type        = string
}

# ── RDS ───────────────────────────────────────────────────────────────────────

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
}

variable "db_engine_version" {
  description = "PostgreSQL engine version."
  type        = string
}

variable "db_allocated_storage" {
  description = "Storage size in GB."
  type        = number
}

variable "db_name" {
  description = "Name of the initial database."
  type        = string
}

variable "db_username" {
  description = "Master username for the RDS instance."
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Master password for the RDS instance."
  type        = string
  sensitive   = true
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated backups."
  type        = number
}
