variable "aws_region" {
  type        = string
  description = "Region for all resources (ALB ACM cert must match)."
  default     = "us-east-1"
}

variable "project" {
  type        = string
  description = "Short name prefix for resources."
  default     = "gigi"
}

variable "environment" {
  type        = string
  description = "Deployment stage (e.g. prod, staging)."
  default     = "prod"
}

variable "db_name" {
  type        = string
  default     = "gigi"
}

variable "db_username" {
  type        = string
  default     = "gigi"
}

variable "acm_certificate_arn" {
  type        = string
  description = "ACM certificate ARN in this region for HTTPS on the ALB (create in AWS Console or Terraform)."
}

variable "cognito_hosted_ui_domain_prefix" {
  type        = string
  description = "Globally unique prefix for https://PREFIX.auth.REGION.amazoncognito.com"
}

variable "cognito_callback_urls" {
  type        = list(string)
  description = "Allowed OAuth redirect URLs (must include https://YOUR_DOMAIN/auth/callback)."
}

variable "cognito_logout_urls" {
  type        = list(string)
  description = "Allowed logout URLs (e.g. https://YOUR_DOMAIN/login)."
}

variable "cors_origins" {
  type        = string
  description = "Comma-separated origins for FastAPI CORS (your public https URL)."
}

variable "desired_count" {
  type        = number
  description = "Number of Fargate tasks (1 is cheapest)."
  default     = 1
}

variable "fargate_cpu" {
  type    = number
  default = 256
}

variable "fargate_memory" {
  type    = number
  default = 512
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_instance_class" {
  type        = string
  description = "Smallest production-capable instance; db.t4g.micro is lowest cost."
  default     = "db.t4g.micro"
}
