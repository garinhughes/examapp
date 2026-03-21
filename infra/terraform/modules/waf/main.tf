resource "aws_wafv2_ip_set" "my_ip" {
  name               = "${var.project}-my-ip"
  scope              = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses          = var.addresses
}

resource "aws_wafv2_web_acl" "restrict_my_ip" {
  name  = "${var.project}-restrict-my-ip"
  scope = "CLOUDFRONT"

  dynamic "default_action" {
    for_each = var.enable_waf ? [1] : []
    content {
      block {}
    }
  }

  dynamic "default_action" {
    for_each = var.enable_waf ? [] : [1]
    content {
      allow {}
    }
  }

  # Rule 1: IP allowlist (dev lockdown — enable_waf = true blocks everyone except listed IPs)
  dynamic "rule" {
    for_each = var.enable_waf ? [1] : []
    content {
      name     = "allow-my-ip"
      priority = 1

      action {
        allow {}
      }

      statement {
        ip_set_reference_statement {
          arn = aws_wafv2_ip_set.my_ip.arn
        }
      }

      visibility_config {
        sampled_requests_enabled   = false
        cloudwatch_metrics_enabled = true
        metric_name                = "allow_my_ip"
      }
    }
  }

  # Rule 2: Rate-based block — throttle IPs sending more than 2000 requests per 5 minutes
  dynamic "rule" {
    for_each = var.enable_rate_limiting ? [1] : []
    content {
      name     = "rate-limit-all"
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
        sampled_requests_enabled   = true
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.project}-rate-limit"
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-waf"
    sampled_requests_enabled   = false
  }
}
