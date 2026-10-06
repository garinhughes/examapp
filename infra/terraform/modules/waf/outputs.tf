output "web_acl_arn" {
  description = "ARN of the Web ACL"
  value       = aws_wafv2_web_acl.main.arn
}

output "api_web_acl_arn" {
  description = "ARN of the API Web ACL"
  value       = aws_wafv2_web_acl.api.arn
}
