output "endpoint" {
  description = "RDS instance endpoint (host:port). Use this to build DATABASE_URL and DIRECT_URL."
  value       = aws_db_instance.this.endpoint
}

output "port" {
  description = "RDS instance port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Database name on the RDS instance."
  value       = aws_db_instance.this.db_name
}

output "instance_id" {
  description = "RDS instance identifier."
  value       = aws_db_instance.this.identifier
}

output "security_group_id" {
  description = "ID of the RDS security group."
  value       = aws_security_group.rds.id
}
