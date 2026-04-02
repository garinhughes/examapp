# EventBridge rule to trigger Lambda on schedule
resource "aws_cloudwatch_event_rule" "itemcount_schedule" {
  name                = "${var.project}-eb-itemcount-scheduler"
  schedule_expression = var.schedule_rate
}

# EventBridge target to invoke Lambda
resource "aws_cloudwatch_event_target" "itemcount_target" {
  rule      = aws_cloudwatch_event_rule.itemcount_schedule.name
  target_id = "ItemCountPublisher"
  arn       = var.lambda_arn
}

# CloudWatch Dashboard (only created if dashboard_vars is provided)
resource "aws_cloudwatch_dashboard" "certshack_examapp" {
  count          = var.dashboard_template_path != "" ? 1 : 0
  dashboard_name = "${var.project}-dashboard"
  dashboard_body = templatefile(var.dashboard_template_path, var.dashboard_vars)
}
