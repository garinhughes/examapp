variable "project" {
  type    = string
  default = "examapp"
}

variable "ecs_task_execution_role_arn" {
  description = "ARN of ECS task execution role for Secrets Manager access"
  type        = string
}

variable "cognito_client_secret_name" {
  description = "Name of the existing Secrets Manager secret holding the Cognito client secret"
  type        = string
  default     = "examapp-cognito-app-client-secret"
}

variable "stripe_secret_key_secret_name" {
  description = "Name of the pre-existing Secrets Manager secret holding the Stripe secret key"
  type        = string
  default     = "examapp-stripe-secret-key"
}

variable "stripe_webhook_secret_name" {
  description = "Name of the pre-existing Secrets Manager secret holding the Stripe webhook signing secret"
  type        = string
  default     = "examapp-stripe-webhook-secret"
}

variable "paypal_client_secret_name" {
  description = "Name of the pre-existing Secrets Manager secret holding the PayPal client secret"
  type        = string
  default     = "examapp-paypal-client-secret"
}

variable "cron_secret_name" {
  description = "Name of the Secrets Manager secret for cron authentication"
  type        = string
  default     = "examapp-cron-secret"
}

variable "unsubscribe_secret_name" {
  description = "Name of the Secrets Manager secret for unsubscribe token signing"
  type        = string
  default     = "examapp-unsubscribe-secret"
}
