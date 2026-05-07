resource "aws_cognito_user_pool" "main" {
  name = "${var.project}-${var.environment}-users"

  auto_verified_attributes = ["email"]
  username_attributes      = ["email"]

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = { Name = "${var.project}-user-pool" }
}

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.project}-${var.environment}-spa"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.cognito_hosted_ui_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}
