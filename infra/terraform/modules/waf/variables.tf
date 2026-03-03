variable "project" {
  description = "Project name prefix for resource names"
  type        = string
}

variable "enable_waf" {
  description = "When true enable the WAF restrictions (provided by root module)"
  type        = bool
}

variable "addresses" {
  description = "List of IP CIDRs to allow when WAF is enabled"
  type        = list(string)
  default     = []
}
