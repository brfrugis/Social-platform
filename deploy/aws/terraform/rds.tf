resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-${var.environment}-db-subnets"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  tags = { Name = "${var.project}-db-subnet-group" }
}

resource "aws_db_instance" "main" {
  identifier                 = "${var.project}-${var.environment}-pg"
  engine                     = "postgres"
  engine_version             = "16"
  instance_class             = var.db_instance_class
  allocated_storage          = var.db_allocated_storage
  max_allocated_storage      = 0
  storage_type               = "gp3"
  db_name                    = var.db_name
  username                   = var.db_username
  password                   = random_password.db.result
  db_subnet_group_name       = aws_db_subnet_group.main.name
  vpc_security_group_ids     = [aws_security_group.rds.id]
  skip_final_snapshot        = true
  publicly_accessible        = false
  backup_retention_period    = 7
  deletion_protection        = false
  storage_encrypted          = true
  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.project}-postgres"
  }
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.project}/${var.environment}/database-url"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgresql+asyncpg://%s:%s@%s:5432/%s",
    var.db_username,
    random_password.db.result,
    aws_db_instance.main.address,
    var.db_name
  )
  depends_on = [aws_db_instance.main]
}
