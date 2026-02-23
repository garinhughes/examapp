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
  default     = ""
}

variable "mgmt_profile" {
  description = "Optional AWS CLI profile name to use for the management account provider. Leave empty to use default credentials."
  type        = string
  default     = ""
}

variable "mgmt_role_arn" {
  description = "ARN of the role in the mgmt account that can be assumed for Route53 management. Set after creating the role."
  type        = string
  default     = ""
}

variable "create_mgmt_role" {
  description = "When true, create the mgmt-side assumable role and its Route53 policy in the management account. Default false (create role manually in mgmt)."
  type        = bool
  default     = false
}
