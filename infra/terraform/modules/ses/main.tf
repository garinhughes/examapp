variable "project" {
  type = string
}

variable "domain" {
  type = string
}

variable "zone_id" {
  type = string
}

# ---------- SES domain identity ----------
resource "aws_ses_domain_identity" "this" {
  domain = var.domain
}

resource "aws_ses_domain_dkim" "this" {
  domain = aws_ses_domain_identity.this.domain
}

# DKIM CNAME records (3 tokens)
resource "aws_route53_record" "dkim" {
  count   = 3
  zone_id = var.zone_id
  name    = "${aws_ses_domain_dkim.this.dkim_tokens[count.index]}._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.this.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# SES domain verification TXT record
resource "aws_route53_record" "ses_verification" {
  zone_id = var.zone_id
  name    = "_amazonses.${var.domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.this.verification_token]
}

# Apex TXT records (SPF + any other apex TXT values) are managed in the
# route53 module to keep all DNS records in one place.

# ---------- outputs ----------
output "ses_domain_identity_arn" {
  value = aws_ses_domain_identity.this.arn
}
