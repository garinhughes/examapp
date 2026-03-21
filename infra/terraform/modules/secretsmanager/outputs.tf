output "cognito_client_secret_arn" {
  value = data.aws_secretsmanager_secret.cognito_client_secret.arn
}

output "gocardless_access_token_secret_arn" {
  value = data.aws_secretsmanager_secret.gocardless_access_token.arn
}

output "gocardless_webhook_secret_arn" {
  value = data.aws_secretsmanager_secret.gocardless_webhook_secret.arn
}

output "origin_verify_secret_arn" {
  value = data.aws_secretsmanager_secret.origin_verify.arn
}