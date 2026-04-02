resource "aws_lambda_function" "itemcount_publisher" {
  filename      = var.lambda_zip
  function_name = "${var.project}-dynamodb-itemcount-publisher"
  role          = var.lambda_role_arn
  handler       = "dynamodb_itemcount_publisher.lambda_handler"
  runtime       = "python3.11"
  timeout       = 30

  environment {
    variables = {
      TABLES    = var.tables_csv
      NAMESPACE = var.namespace
    }
  }

}

resource "aws_lambda_function_url" "itemcount" {
  function_name      = aws_lambda_function.itemcount_publisher.function_name
  authorization_type = "AWS_IAM"
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.itemcount_publisher.function_name
  principal     = "events.amazonaws.com"
  source_arn    = var.event_rule_arn
}
