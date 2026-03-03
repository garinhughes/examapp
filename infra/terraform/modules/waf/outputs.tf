output "web_acl_arn" {
  description = "ARN of the Web ACL"
  value       = aws_wafv2_web_acl.restrict_my_ip.arn
}

output "ip_set_arn" {
  description = "ARN of the IP set"
  value       = aws_wafv2_ip_set.my_ip.arn
}
