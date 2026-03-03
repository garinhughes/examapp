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

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-waf"
    sampled_requests_enabled   = false
  }
}
