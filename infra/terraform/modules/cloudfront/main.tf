# ---------- variables ----------
variable "project" {
  type    = string
  default = "examapp"
}

variable "domain" {
  type = string
}

variable "acm_certificate_arn" {
  description = "ACM cert ARN in us-east-1 for CloudFront"
  type        = string
}

variable "web_acl_arn" {
  description = "Optional WAF Web ACL ARN to attach to the CloudFront distribution"
  type        = string
  default     = null
}

variable "s3_bucket_id" {
  description = "S3 site bucket ID (for bucket policy)"
  type        = string
}

variable "s3_bucket_arn" {
  description = "S3 site bucket ARN (for bucket policy)"
  type        = string
}

variable "s3_bucket_regional_domain_name" {
  description = "S3 site bucket regional domain name (for CloudFront origin)"
  type        = string
}

variable "alb_dns_name" {
  description = "ALB DNS name for the API origin"
  type        = string
  default     = ""
}

variable "api_acm_certificate_arn" {
  description = "ACM cert ARN in us-east-1 for api.domain CloudFront distribution"
  type        = string
  default     = ""
}

variable "origin_verify_secret" {
  description = "Secret value injected as X-Origin-Verify header on requests to the ALB origin"
  type        = string
  sensitive   = true
  default     = ""
}

# ---------- CloudFront Function — SPA path rewrite ----------
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${var.project}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/viewer-request.js")
}

# ---------- OAC ----------
resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "${var.project}-oac"
  description                       = "OAC for ${var.project} S3 origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------- CloudFront distribution ----------
resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # cheapest: NA + EU only
  aliases             = [var.domain, "www.${var.domain}"]
  comment             = "${var.project} frontend"

  origin {
    domain_name              = var.s3_bucket_regional_domain_name
    origin_id                = "S3"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  default_cache_behavior {
    target_origin_id       = "S3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # SPA fallback: serve 404.html (not index.html) so unknown URLs get noindex meta.
  # React hydrates normally — valid routes (e.g. /pricing) still render correctly.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # Optionally attach a WAFv2 Web ACL by ARN
  web_acl_id = var.web_acl_arn

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  tags = { Project = var.project }
}

# Bucket policy: allow CloudFront OAC to GetObject
# Lives here because it depends on the distribution ARN
resource "aws_s3_bucket_policy" "site" {
  bucket = var.s3_bucket_id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${var.s3_bucket_arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.cdn.arn
        }
      }
    }]
  })
}

# ---------- API CloudFront distribution ----------
# Proxies api.domain → ALB; CloudFront injects X-Origin-Verify so the
# ALB SG can be locked to CloudFront IPs only (no direct public access).
resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  is_ipv6_enabled = true
  price_class     = "PriceClass_100"
  aliases         = ["api.${var.domain}"]
  comment         = "${var.project} api"

  origin {
    domain_name = var.alb_dns_name
    origin_id   = "ALB"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = var.origin_verify_secret
    }
  }

  default_cache_behavior {
    target_origin_id       = "ALB"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Origin", "Accept", "Content-Type", "X-Requested-With"]
      cookies { forward = "all" }
    }

    # No caching — the API is fully dynamic
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  viewer_certificate {
    acm_certificate_arn      = var.api_acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  tags = { Project = var.project }
}

# ---------- outputs ----------
output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.cdn.domain_name
}

output "cloudfront_hosted_zone_id" {
  value = aws_cloudfront_distribution.cdn.hosted_zone_id
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.cdn.id
}

output "cloudfront_distribution_arn" {
  value = aws_cloudfront_distribution.cdn.arn
}

output "api_cloudfront_domain_name" {
  value = aws_cloudfront_distribution.api.domain_name
}

output "api_cloudfront_hosted_zone_id" {
  value = aws_cloudfront_distribution.api.hosted_zone_id
}
