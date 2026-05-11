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

output "cron_secret_arn" {
  value = data.aws_secretsmanager_secret.cron_secret.arn
}

output "cron_secret_value" {
  value     = data.aws_secretsmanager_secret_version.cron_secret.secret_string
  sensitive = true
}

output "unsubscribe_secret_arn" {
  value = data.aws_secretsmanager_secret.unsubscribe_secret.arn
}
