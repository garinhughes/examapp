# Cognito client secret (managed out-of-band)
data "aws_secretsmanager_secret" "cognito_client_secret" {
  name = var.cognito_client_secret_name
}

# Allow the ECS task execution role to read the secret
resource "aws_secretsmanager_secret_policy" "cognito_client_secret_policy" {
  secret_arn = data.aws_secretsmanager_secret.cognito_client_secret.arn
  policy     = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowEcsTaskGetSecret",
        Effect = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource = data.aws_secretsmanager_secret.cognito_client_secret.arn
      }
    ]
  })
}

# Reference existing GoCardless secrets (managed out-of-band)
data "aws_secretsmanager_secret" "gocardless_access_token" {
  name = var.gocardless_access_token_secret_name
}

# Grant the ECS task execution role permission to read the GoCardless secrets
resource "aws_secretsmanager_secret_policy" "gocardless_access_token_policy" {
  secret_arn = data.aws_secretsmanager_secret.gocardless_access_token.arn
  policy     = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowEcsTaskGetSecret",
        Effect = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource = data.aws_secretsmanager_secret.gocardless_access_token.arn
      }
    ]
  })
}

data "aws_secretsmanager_secret" "gocardless_webhook_secret" {
  name = var.gocardless_webhook_secret_name
}

resource "aws_secretsmanager_secret_policy" "gocardless_webhook_secret_policy" {
  secret_arn = data.aws_secretsmanager_secret.gocardless_webhook_secret.arn
  policy     = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowEcsTaskGetSecret",
        Effect = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource = data.aws_secretsmanager_secret.gocardless_webhook_secret.arn
      }
    ]
  })
}

# ---- Origin verify secret (CloudFront → ALB custom header) ----
# Managed out-of-band (already exists in Secrets Manager).
# Inject as X-Origin-Verify header from CloudFront; backend rejects requests missing it.
data "aws_secretsmanager_secret" "origin_verify" {
  name = var.origin_verify_secret_name
}

resource "aws_secretsmanager_secret_policy" "origin_verify_policy" {
  secret_arn = data.aws_secretsmanager_secret.origin_verify.arn
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Sid    = "AllowEcsTaskGetSecret",
      Effect = "Allow",
      Principal = { AWS = var.ecs_task_execution_role_arn },
      Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      Resource = data.aws_secretsmanager_secret.origin_verify.arn
    }]
  })
}
