module "rds" {
  source = "../../modules/rds"

  project     = var.project
  environment = var.environment

  vpc_id                = var.vpc_id
  ec2_security_group_id = var.ec2_security_group_id
  subnet_ids            = var.rds_subnet_ids
  preferred_az          = var.rds_preferred_az

  instance_class        = var.db_instance_class
  engine_version        = var.db_engine_version
  allocated_storage     = var.db_allocated_storage
  db_name               = var.db_name
  db_username           = var.db_username
  db_password           = var.db_password
  backup_retention_days = var.db_backup_retention_days
}
