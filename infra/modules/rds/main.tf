# ── Security group ────────────────────────────────────────────────────────────

resource "aws_security_group" "rds" {
  name        = "${var.project}-${var.environment}-rds-sg"
  description = "Allow PostgreSQL access from the EC2 app server only."
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from EC2 app server"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.ec2_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-${var.environment}-rds-sg"
  }
}

# ── DB subnet group ───────────────────────────────────────────────────────────

resource "aws_db_subnet_group" "this" {
  name        = "${var.project}-${var.environment}-rds-subnet-group"
  description = "Subnet group for ${var.project} ${var.environment} RDS instance."
  subnet_ids  = var.subnet_ids

  tags = {
    Name = "${var.project}-${var.environment}-rds-subnet-group"
  }
}

# ── RDS instance ──────────────────────────────────────────────────────────────

resource "aws_db_instance" "this" {
  identifier        = "${var.project}-${var.environment}-postgres"
  engine            = "postgres"
  engine_version    = var.engine_version
  instance_class    = var.instance_class
  apply_immediately = true

  allocated_storage = var.allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  availability_zone      = var.preferred_az

  publicly_accessible       = false
  multi_az                  = false
  backup_retention_period   = var.backup_retention_days
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project}-${var.environment}-postgres-final-snapshot"
  deletion_protection       = true

  lifecycle {
    # Password is managed outside Terraform after first apply.
    ignore_changes = [password]
  }

  tags = {
    Name = "${var.project}-${var.environment}-postgres"
  }
}
