terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.useast1]
    }
  }
}

# CloudFront cert — must be us-east-1
resource "aws_acm_certificate" "cloudfront" {
  provider                  = aws.useast1
  domain_name               = var.domain
  subject_alternative_names = ["www.${var.domain}"]
  validation_method         = "DNS"
  tags                      = { Project = var.project }
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider        = aws.useast1
  certificate_arn = aws_acm_certificate.cloudfront.arn
}

# API CloudFront cert — must be us-east-1 (covers api subdomain for the API CF distribution)
resource "aws_acm_certificate" "api_cloudfront" {
  provider          = aws.useast1
  domain_name       = "api.${var.domain}"
  validation_method = "DNS"
  tags              = { Project = var.project }
}

resource "aws_acm_certificate_validation" "api_cloudfront" {
  provider        = aws.useast1
  certificate_arn = aws_acm_certificate.api_cloudfront.arn
}

# ALB cert — default region (eu-west-1)
resource "aws_acm_certificate" "alb" {
  domain_name               = "api.${var.domain}"
  subject_alternative_names = [var.domain]
  validation_method         = "DNS"
  tags                      = { Project = var.project }
}

resource "aws_acm_certificate_validation" "alb" {
  certificate_arn = aws_acm_certificate.alb.arn
}
