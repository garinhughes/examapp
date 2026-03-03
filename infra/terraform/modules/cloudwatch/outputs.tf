output "event_rule_arn" {
  value = aws_cloudwatch_event_rule.itemcount_schedule.arn
}

output "event_rule_name" {
  value = aws_cloudwatch_event_rule.itemcount_schedule.name
}
