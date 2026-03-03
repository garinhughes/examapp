variable "project" {
  type    = string
  default = "examapp"
}

variable "lambda_arn" {
  description = "ARN of the Lambda function to invoke"
  type        = string
}

variable "schedule_rate" {
  type    = string
  default = "rate(30 minutes)"
}

# Dashboard variables
variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "dashboard_template_path" {
  description = "Path to the dashboard template file"
  type        = string
  default     = ""
}

variable "dashboard_vars" {
  description = "Variables to pass to the dashboard template"
  type        = map(any)
  default     = {}
}
