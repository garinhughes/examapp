output "function_arn" {
  value = aws_lambda_function.itemcount_publisher.arn
}

output "function_name" {
  value = aws_lambda_function.itemcount_publisher.function_name
}

output "function_url" {
  value = aws_lambda_function_url.itemcount.function_url
}
