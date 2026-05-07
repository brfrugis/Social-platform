output "alb_dns_name" {
  description = "Point your DNS CNAME (or ACM subject alternative) here for HTTPS."
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  description = "docker build -t IMAGE . && aws ecr get-login-password | docker login ... && docker push"
  value       = aws_ecr_repository.app.repository_url
}

output "database_secret_arn" {
  value       = aws_secretsmanager_secret.database_url.arn
  description = "ECS task already reads DATABASE_URL from this secret."
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.spa.id
}

output "cognito_hosted_ui_base" {
  value       = "https://${var.cognito_hosted_ui_domain_prefix}.auth.${var.aws_region}.amazoncognito.com"
  description = "Hosted UI / OAuth2 domain (no trailing slash). Map to VITE_COGNITO_DOMAIN."
}

output "cognito_region" {
  value = var.aws_region
}
