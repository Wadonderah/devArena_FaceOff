output "rds_endpoint" {
  description = "RDS endpoint. Use this to build DATABASE_URL and DIRECT_URL in api.env."
  value       = module.rds.endpoint
}

output "rds_port" {
  description = "RDS port."
  value       = module.rds.port
}

output "rds_db_name" {
  description = "Database name."
  value       = module.rds.db_name
}

output "rds_instance_id" {
  description = "RDS instance identifier."
  value       = module.rds.instance_id
}

output "rds_security_group_id" {
  description = "RDS security group ID."
  value       = module.rds.security_group_id
}
