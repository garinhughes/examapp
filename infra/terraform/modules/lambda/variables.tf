variable "project" {
  type = string
}

variable "lambda_zip" {
  description = "Path to the Lambda zip file"
  type        = string
}

variable "tables_csv" {
  description = "Comma-separated list of DynamoDB table names for the lambda env var"
  type        = string
}

variable "namespace" {
  type    = string
  default = "examapp/DynamoDB"
}

variable "lambda_role_arn" {
  description = "ARN of the IAM role for the lambda function"
  type        = string
}

variable "event_rule_arn" {
  description = "ARN of the CloudWatch event rule that triggers the lambda"
  type        = string
}
