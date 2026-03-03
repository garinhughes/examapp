output "cognito_client_secret_arn" {
  value = aws_secretsmanager_secret.cognito_client_secret.arn
}