resource "aws_api_gateway_rest_api" "this" {
  name        = var.api_name != null ? var.api_name : "${var.project}-${var.resource_path}-api"
  description = "Public proxy for ${var.project} - managed by terraform"

  body = templatefile("${path.module}/openapi.tftpl", {
    region       = var.region
    lambda_arn   = var.lambda_arn
    resource_path = trim(var.resource_path, "/")
    stage_name   = var.stage_name
    api_name     = var.api_name != null ? var.api_name : "${var.project}-api"
  })
}

resource "aws_api_gateway_deployment" "deploy" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  # Force a new deployment when the API body changes (e.g., new methods/paths)
  triggers = {
    redeploy_on_body_change = sha1(aws_api_gateway_rest_api.this.body)
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Create a separate stage (required by newer provider versions)
resource "aws_api_gateway_stage" "stage" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  stage_name    = var.stage_name
  deployment_id = aws_api_gateway_deployment.deploy.id
}

resource "aws_lambda_permission" "allow_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/*"
}
