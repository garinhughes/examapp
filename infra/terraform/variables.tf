variable "region" {
  description = "Primary AWS region"
  type        = string
  default     = "eu-west-1"
}

variable "account_id" {
  description = "Target AWS account id (certshack)"
  type        = string
  default     = ""
}

variable "project" {
  description = "Project name"
  type        = string
  default     = "examapp"
}

variable "domain" {
  description = "Primary domain for CloudFront/Route53"
  type        = string
  default     = "certshack.com"
}
