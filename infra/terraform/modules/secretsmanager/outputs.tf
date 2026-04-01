output "cognito_client_secret_arn" {
  value = data.aws_secretsmanager_secret.cognito_client_secret.arn
}

output "stripe_secret_key_arn" {
  value = data.aws_secretsmanager_secret.stripe_secret_key.arn
}

output "stripe_webhook_secret_arn" {
  value = data.aws_secretsmanager_secret.stripe_webhook_secret.arn
}

output "paypal_client_secret_arn" {
  value = data.aws_secretsmanager_secret.paypal_client_secret.arn
}
