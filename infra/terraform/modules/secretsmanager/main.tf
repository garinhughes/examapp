# Cognito client secret (managed out-of-band)
data "aws_secretsmanager_secret" "cognito_client_secret" {
  name = var.cognito_client_secret_name
}

# Allow the ECS task execution role to read the secret
resource "aws_secretsmanager_secret_policy" "cognito_client_secret_policy" {
  secret_arn = data.aws_secretsmanager_secret.cognito_client_secret.arn
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "AllowEcsTaskGetSecret",
        Effect    = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action    = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource  = data.aws_secretsmanager_secret.cognito_client_secret.arn
      }
    ]
  })
}

# Reference existing Stripe secrets (managed out-of-band)
data "aws_secretsmanager_secret" "stripe_secret_key" {
  name = var.stripe_secret_key_secret_name
}

# Grant the ECS task execution role permission to read the Stripe secrets
resource "aws_secretsmanager_secret_policy" "stripe_secret_key_policy" {
  secret_arn = data.aws_secretsmanager_secret.stripe_secret_key.arn
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "AllowEcsTaskGetSecret",
        Effect    = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action    = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource  = data.aws_secretsmanager_secret.stripe_secret_key.arn
      }
    ]
  })
}

data "aws_secretsmanager_secret" "stripe_webhook_secret" {
  name = var.stripe_webhook_secret_name
}

resource "aws_secretsmanager_secret_policy" "stripe_webhook_secret_policy" {
  secret_arn = data.aws_secretsmanager_secret.stripe_webhook_secret.arn
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "AllowEcsTaskGetSecret",
        Effect    = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action    = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource  = data.aws_secretsmanager_secret.stripe_webhook_secret.arn
      }
    ]
  })
}

# PayPal client secret (managed out-of-band)
data "aws_secretsmanager_secret" "paypal_client_secret" {
  name = var.paypal_client_secret_name
}

resource "aws_secretsmanager_secret_policy" "paypal_client_secret_policy" {
  secret_arn = data.aws_secretsmanager_secret.paypal_client_secret.arn
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "AllowEcsTaskGetSecret",
        Effect    = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action    = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource  = data.aws_secretsmanager_secret.paypal_client_secret.arn
      }
    ]
  })
}

# Cron secret (managed out-of-band)
data "aws_secretsmanager_secret" "cron_secret" {
  name = var.cron_secret_name
}

resource "aws_secretsmanager_secret_policy" "cron_secret_policy" {
  secret_arn = data.aws_secretsmanager_secret.cron_secret.arn
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "AllowEcsTaskGetSecret",
        Effect    = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action    = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource  = data.aws_secretsmanager_secret.cron_secret.arn
      }
    ]
  })
}

# Unsubscribe token signing secret (managed out-of-band)
data "aws_secretsmanager_secret" "unsubscribe_secret" {
  name = var.unsubscribe_secret_name
}

resource "aws_secretsmanager_secret_policy" "unsubscribe_secret_policy" {
  secret_arn = data.aws_secretsmanager_secret.unsubscribe_secret.arn
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "AllowEcsTaskGetSecret",
        Effect    = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action    = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource  = data.aws_secretsmanager_secret.unsubscribe_secret.arn
      }
    ]
  })
}
