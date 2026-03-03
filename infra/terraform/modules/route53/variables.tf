variable "project" {
  description = "Project name"
  type        = string
}

variable "zone_id" {
  description = "Route53 hosted zone ID"
  type        = string
}

variable "domain" {
  description = "Primary domain"
  type        = string
}

variable "cloudfront_domain_name" {
  description = "CloudFront distribution domain name for alias records"
  type        = string
  default     = ""
}

variable "cloudfront_hosted_zone_id" {
  description = "CloudFront hosted zone ID for alias records"
  type        = string
  default     = ""
}

variable "alb_dns_name" {
  description = "ALB DNS name for alias records"
  type        = string
  default     = ""
}

variable "alb_zone_id" {
  description = "ALB hosted zone id for alias records"
  type        = string
  default     = ""
}

variable "acm_dvos" {
  description = "Map of ACM domain validation options (keyed by domain_name)"
  type        = map(any)
  default     = {}
}

variable "create_aliases" {
  description = "When true create apex/www/api alias records"
  type        = bool
  default     = false
}

