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

variable "apex_txt_records" {
  description = "TXT record values to publish at the apex domain (SPF, GSC verification, etc.)"
  type        = list(string)
  default     = []
}

variable "create_mail_records" {
  description = "When true, create Zoho MX and DKIM records for mail hosting"
  type        = bool
  default     = false
}

