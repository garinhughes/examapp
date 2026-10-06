terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.useast1]
    }
  }
}

resource "aws_wafv2_web_acl" "main" {
  provider = aws.useast1
  name     = "${var.project}-waf"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rule 1: OWASP Top 10 protection (SQL injection, XSS, path traversal, etc.)
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 0

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-core-rules"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: Auth rate limiting — 100 req/5min/IP on /auth/* (WAFv2 minimum; credential-stuffing ceiling)
  # Evaluated before the general rule so auth endpoints are held to the tighter budget.
  rule {
    name     = "rate-limit-auth"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 100
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            search_string = "/auth/"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
            positional_constraint = "STARTS_WITH"
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-rate-limit-auth"
      sampled_requests_enabled   = true
    }
  }

  # Rule 3: General rate limiting — 2000 req/5min/IP (~400/min); DDoS backstop.
  # Fastify's per-user limits are the real budget; WAF only catches floods from a single IP.
  rule {
    name     = "rate-limit"
    priority = 2

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-waf"
    sampled_requests_enabled   = false
  }
}

# ---------- API Web ACL (api.certshack.com) ----------
# Separate from the frontend ACL: the managed CommonRuleSet blocks request
# bodies over 8KB, which would break attempt submissions. This one only
# rate-limits. WAF keys on the real viewer IP, so a spoofed X-Forwarded-For
# (which Fastify's req.ip trusts) cannot dodge it.
resource "aws_wafv2_web_acl" "api" {
  provider = aws.useast1
  name     = "${var.project}-api-waf"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # 1000 req/5min/IP (~3/s sustained) — well above a real user's SPA traffic.
  rule {
    name     = "api-rate-limit"
    priority = 0

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project}-api-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-api-waf"
    sampled_requests_enabled   = true
  }
}
