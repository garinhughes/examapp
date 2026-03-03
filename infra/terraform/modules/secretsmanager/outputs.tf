output "cognito_client_secret_arn" {
  value = aws_secretsmanager_secret.cognito_client_secret.arn
}

output "cognito_app_client_id_arn" {
  value = aws_secretsmanager_secret.cognito_app_client_id.arn
}
