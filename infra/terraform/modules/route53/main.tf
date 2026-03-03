resource "aws_route53_record" "acm_validation" {
  for_each = var.acm_dvos

  zone_id = var.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  ttl     = 60
  records = [each.value.resource_record_value]

  allow_overwrite = true
}

# Conditional alias records: created only when `create_aliases` is true
resource "aws_route53_record" "apex" {
  count = var.create_aliases ? 1 : 0

  zone_id         = var.zone_id
  name            = var.domain
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  count = var.create_aliases ? 1 : 0

  zone_id         = var.zone_id
  name            = "www.${var.domain}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  count = var.create_aliases ? 1 : 0

  zone_id         = var.zone_id
  name            = "api.${var.domain}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
