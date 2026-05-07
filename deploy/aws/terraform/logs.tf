resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}-${var.environment}-api"
  retention_in_days = 30
}
