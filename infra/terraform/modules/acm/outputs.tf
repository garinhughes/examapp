output "cloudfront_certificate_arn" {
  value = aws_acm_certificate_validation.cloudfront.certificate_arn
}

output "alb_certificate_arn" {
  value = aws_acm_certificate_validation.alb.certificate_arn
}

output "cloudfront_domain_validation_options" {
  value = aws_acm_certificate.cloudfront.domain_validation_options
}

output "alb_domain_validation_options" {
  value = aws_acm_certificate.alb.domain_validation_options
}

output "api_cloudfront_certificate_arn" {
  value = aws_acm_certificate_validation.api_cloudfront.certificate_arn
}

output "api_cloudfront_domain_validation_options" {
  value = aws_acm_certificate.api_cloudfront.domain_validation_options
}
