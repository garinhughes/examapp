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

variable "github_repo" {
  description = "GitHub repository in the form 'org/repo' used for OIDC trust. Set in your terraform.tfvars or via CLI."
  type        = string
  default     = "garinhughes/examapp"
}

variable "enable_waf" {
  description = "When true, enable the WAF restriction rule that only allows configured IPs. Set false to allow all traffic."
  type        = bool
  default     = true
}
