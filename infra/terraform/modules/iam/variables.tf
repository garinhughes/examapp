variable "create_mgmt_role" {
  description = "When true, create the mgmt-side assumable role and its Route53 policy in the management account."
  type        = bool
  default     = false
}

variable "mgmt_profile" {
  description = "Optional AWS CLI profile name to use for the management account provider."
  type        = string
  default     = ""
}

variable "mgmt_role_arn" {
  description = "ARN of the role in the mgmt account that can be assumed for Route53 management."
  type        = string
  default     = ""
}
