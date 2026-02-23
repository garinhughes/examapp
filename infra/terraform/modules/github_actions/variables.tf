variable "project" {
  type    = string
  default = "examapp"
}

variable "account_id" {
  type = string
}

variable "github_org_repo" {
  description = "GitHub repo in the form org/repo (used in OIDC condition)"
  type        = string
}

variable "github_environment" {
  description = "Optional environment name to restrict tokens (e.g. 'production')"
  type        = string
  default     = "*"
}
