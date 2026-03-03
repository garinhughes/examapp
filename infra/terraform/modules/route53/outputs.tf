output "zone_id" {
  value = var.zone_id
}

output "acm_record_names" {
  value = [for k, r in aws_route53_record.acm_validation : k]
  description = "Keys for the ACM validation records"
}
