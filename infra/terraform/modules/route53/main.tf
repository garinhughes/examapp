# Apex TXT records — SPF, GSC verification, etc.
resource "aws_route53_record" "apex_txt" {
  count   = length(var.apex_txt_records) > 0 ? 1 : 0
  zone_id = var.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 300
  records = var.apex_txt_records
}

# Zoho MX records for inbound mail hosting
resource "aws_route53_record" "zoho_mx" {
  count   = var.create_mail_records ? 1 : 0
  zone_id = var.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 300
  records = [
    "10 mx.zoho.eu.",
    "20 mx2.zoho.eu.",
    "50 mx3.zoho.eu.",
  ]
  allow_overwrite = true
}

# Zoho DKIM TXT (zmail._domainkey)
resource "aws_route53_record" "zoho_dkim" {
  count   = var.create_mail_records ? 1 : 0
  zone_id = var.zone_id
  name    = "zmail._domainkey.${var.domain}"
  type    = "TXT"
  ttl     = 300
  records = [
    "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCX+3Jt/xEiq25ljv+I5L1jZK8gItDqKvLB+Iq/GKDa3DyprUuGMoMO+wqDfJU6OFzEzvBrUZd1mWAxLfsQQNiOsN3TeTAAAIgE2bN6foica/mJsRSZ3/FXQtPS6sGm6IPsmkbqaceVza4Ra917AEzJ2VxHa9UGTTPLkYNWtvZCNwIDAQAB",
  ]
  allow_overwrite = true
}

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
    name                   = var.api_cloudfront_domain_name
    zone_id                = var.api_cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

