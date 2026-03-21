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

variable "gocardless_access_token_secret_name" {
  description = "Name of the pre-existing Secrets Manager secret holding GoCardless access token"
  type        = string
  default     = "examapp-gocardless-access-token"
}

variable "gocardless_webhook_secret_name" {
  description = "Name of the pre-existing Secrets Manager secret holding GoCardless webhook secret"
  type        = string
  default     = "examapp-gocardless-webhook-secret"
}

variable "origin_verify_secret_name" {
  description = "Name of the existing Secrets Manager secret holding the X-Origin-Verify shared secret"
  type        = string
  default     = "examapp-origin-verify-secret"
}
