output "invoke_url" {
  value = "https://${aws_api_gateway_rest_api.this.id}.execute-api.${var.region}.amazonaws.com/${var.stage_name}/${var.resource_path}"
}

output "execution_arn" {
  value = aws_api_gateway_rest_api.this.execution_arn
}
