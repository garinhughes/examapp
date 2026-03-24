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

variable "cognito_admin_role_arn" {
  description = "ARN of the IAM role in the management account that grants Cognito admin access. The ECS task role will be allowed to assume this role."
  type        = string
  default     = "arn:aws:iam::030461496359:role/examapp-mgmt-cross-account-role"
}

variable "enable_waf" {
  description = "When true, enable the WAF restriction rule that only allows configured IPs. Set false to allow all traffic."
  type        = bool
  default     = false
}

variable "enable_rate_limiting" {
  description = "When true, add a WAF rate-based rule blocking IPs that exceed 2000 requests per 5 minutes."
  type        = bool
  default     = true
}
