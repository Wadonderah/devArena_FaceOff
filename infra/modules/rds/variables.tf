variable "project" {
  description = "Short project identifier used in resource names."
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. production)."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where the RDS instance will be created."
  type        = string
}

variable "ec2_security_group_id" {
  description = "Security group ID of the EC2 app server. Inbound port 5432 is opened from this SG only."
  type        = string
}

variable "subnet_ids" {
  description = "List of subnet IDs for the DB subnet group. Must span at least two AZs."
  type        = list(string)
}

variable "preferred_az" {
  description = "AZ to place the RDS instance in. Should match the EC2 AZ to avoid cross-AZ latency."
  type        = string
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
}

variable "engine_version" {
  description = "PostgreSQL engine version."
  type        = string
}

variable "allocated_storage" {
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

variable "backup_retention_days" {
  description = "Number of days to retain automated backups."
  type        = number
}
