# Cognito client secret (value managed out-of-band)
resource "aws_secretsmanager_secret" "cognito_client_secret" {
  name        = "${var.project}-cognito-client-secret"
  description = "Cognito app client secret for ${var.project} (certshack account)"
  tags        = { Project = var.project }

  # The secret value is set via AWS CLI / console — not managed by Terraform.
  # This avoids Terraform overwriting the real Cognito secret on every apply.
  lifecycle { ignore_changes = [tags] }
}

# Allow the ECS task execution role to read the secret
resource "aws_secretsmanager_secret_policy" "cognito_client_secret_policy" {
  secret_arn = aws_secretsmanager_secret.cognito_client_secret.arn
  policy     = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowEcsTaskGetSecret",
        Effect = "Allow",
        Principal = { AWS = var.ecs_task_execution_role_arn },
        Action = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        Resource = aws_secretsmanager_secret.cognito_client_secret.arn
      }
    ]
  })
}
