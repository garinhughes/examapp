# ---------- variables ----------
variable "project" {
  type    = string
  default = "examapp"
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "ecs_task_execution_role_arn" {
  type = string
}

variable "ecs_task_role_arn" {
  type = string
}

variable "ecr_backend_url" {
  type = string
}

variable "backend_image_tag" {
  type    = string
  default = "latest"
}

variable "auth_mode" {
  description = "Authentication mode for the backend: 'dev' or 'cognito'"
  type        = string
  default     = "cognito"
}

variable "backend_port" {
  type    = number
  default = 3000
}

variable "acm_certificate_arn" {
  description = "ACM cert ARN in eu-west-1 for ALB HTTPS"
  type        = string
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "cpu" {
  description = "Fargate task CPU (256 = 0.25 vCPU — smallest)"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate task memory in MiB (512 = minimum for 256 CPU)"
  type        = number
  default     = 512
}

variable "dynamodb_table_name" {
  type    = string
  default = ""
}

variable "exam_source" {
  type    = string
  default = "s3"
}

variable "s3_bucket" {
  type    = string
  default = ""
}

variable "exams_index_table" {
  type    = string
  default = ""
}

variable "attempts_table" {
  type    = string
  default = ""
}

variable "gam_table" {
  type    = string
  default = ""
}

variable "users_table" {
  type    = string
  default = ""
}

variable "entitlements_table" {
  type    = string
  default = ""
}

variable "audit_table" {
  type    = string
  default = ""
}

variable "images_s3_bucket" {
  type    = string
  default = ""
}

variable "skill_lab_source" {
  type    = string
  default = "s3"
}

variable "skill_lab_s3_bucket" {
  type    = string
  default = ""
}

variable "skill_lab_index_table" {
  type    = string
  default = ""
}

variable "skill_lab_attempts_table" {
  type    = string
  default = ""
}

variable "cognito_domain" {
  type    = string
  default = ""
}

variable "cognito_app_client_id" {
  type    = string
  default = ""
}

variable "cognito_region" {
  type    = string
  default = "eu-west-1"
}

variable "cognito_user_pool_id" {
  type    = string
  default = ""
}

variable "cognito_redirect_uri" {
  type    = string
  default = ""
}

variable "frontend_origin" {
  type    = string
  default = ""
}

variable "cognito_client_secret_arn" {
  type    = string
  default = ""
}

variable "origin_verify_secret_arn" {
  description = "ARN of Secrets Manager secret for X-Origin-Verify header validation"
  type        = string
  default     = ""
}

variable "ses_from_address" {
  type    = string
  default = "noreply@certshack.com"
}

variable "ses_support_address" {
  type    = string
  default = "support@certshack.com"
}

variable "issue_reports_table" {
  type    = string
  default = ""
}

variable "metrics_table" {
  type    = string
  default = ""
}

variable "interactions_table" {
  type    = string
  default = ""
}

variable "cognito_admin_role_arn" {
  description = "ARN of cross-account IAM role for Cognito admin operations (empty = use default creds)"
  type        = string
  default     = "arn:aws:iam::030461496359:role/examapp-mgmt-cross-account-role"
}

variable "paypal_client_id" {
  type    = string
  default = ""
}

variable "paypal_api_base" {
  type    = string
  default = "https://api-m.paypal.com"
}

variable "paypal_plan_id_monthly" {
  type    = string
  default = ""
}

variable "paypal_plan_id_annual" {
  type    = string
  default = ""
}

variable "paypal_webhook_id" {
  type    = string
  default = ""
}

variable "paypal_client_secret_arn" {
  type    = string
  default = ""
}

variable "stripe_secret_key_arn" {
  type    = string
  default = ""
}

variable "stripe_webhook_secret_arn" {
  type    = string
  default = ""
}

variable "stripe_price_id_monthly" {
  type    = string
  default = ""
}

variable "stripe_price_id_annual" {
  type    = string
  default = ""
}

# ---------- security groups ----------
resource "aws_security_group" "alb" {
  name_prefix = "${var.project}-alb-"
  description = "ALB - allow HTTPS from internet"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-alb-sg" }
  lifecycle { create_before_destroy = true }
}

resource "aws_security_group" "ecs" {
  name_prefix = "${var.project}-ecs-"
  description = "ECS tasks - allow traffic from ALB only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "From ALB"
    from_port       = var.backend_port
    to_port         = var.backend_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-ecs-sg" }
  lifecycle { create_before_destroy = true }
}

# ---------- ALB ----------
resource "aws_lb" "this" {
  name               = "${var.project}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  tags               = { Project = var.project }
}

resource "aws_lb_target_group" "backend" {
  name_prefix = "exbk-"
  port        = var.backend_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  tags = { Project = var.project }

  lifecycle { create_before_destroy = true }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# ---------- ECS cluster ----------
resource "aws_ecs_cluster" "this" {
  name = "${var.project}-cluster"

  setting {
    name  = "containerInsights"
    value = "enhanced"
  }

  tags = { Project = var.project }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ---------- CloudWatch log group ----------
resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project}-backend"
  retention_in_days = 14
  tags              = { Project = var.project }
}

# ---------- task definition ----------
locals {
  container_environment = [
    { name = "EXAM_SOURCE", value = var.exam_source },
    { name = "SESSIONS_TABLE", value = var.dynamodb_table_name },
    { name = "AWS_REGION", value = var.region },
    { name = "S3_BUCKET", value = var.s3_bucket },
    { name = "EXAMS_INDEX_TABLE", value = var.exams_index_table },
    { name = "ATTEMPTS_TABLE", value = var.attempts_table },
    { name = "GAM_TABLE", value = var.gam_table },
    { name = "USERS_TABLE", value = var.users_table },
    { name = "ENTITLEMENTS_TABLE", value = var.entitlements_table },
    { name = "AUDIT_TABLE", value = var.audit_table },
    { name = "IMAGES_S3_BUCKET", value = var.images_s3_bucket },
    { name = "SKILL_LAB_SOURCE", value = var.skill_lab_source },
    { name = "SKILL_LAB_S3_BUCKET", value = var.skill_lab_s3_bucket },
    { name = "SKILL_LAB_INDEX_TABLE", value = var.skill_lab_index_table },
    { name = "SKILL_LAB_ATTEMPTS_TABLE", value = var.skill_lab_attempts_table },
    { name = "AUTH_MODE", value = var.auth_mode },
    { name = "COGNITO_DOMAIN", value = var.cognito_domain },
    { name = "COGNITO_APP_CLIENT_ID", value = var.cognito_app_client_id },
    { name = "COGNITO_REGION", value = var.cognito_region },
    { name = "COGNITO_USER_POOL_ID", value = var.cognito_user_pool_id },
    { name = "COGNITO_REDIRECT_URI", value = var.cognito_redirect_uri },
    { name = "FRONTEND_ORIGIN", value = var.frontend_origin },
    { name = "SES_FROM_ADDRESS", value = var.ses_from_address },
    { name = "SES_SUPPORT_ADDRESS", value = var.ses_support_address },
    { name = "ISSUE_REPORTS_TABLE", value = var.issue_reports_table },
    { name = "METRICS_TABLE", value = var.metrics_table },
    { name = "INTERACTIONS_TABLE", value = var.interactions_table },
    { name = "COGNITO_ADMIN_ROLE_ARN", value = var.cognito_admin_role_arn },
    { name = "PAYPAL_CLIENT_ID", value = var.paypal_client_id },
    { name = "PAYPAL_API_BASE", value = var.paypal_api_base },
    { name = "PAYPAL_PLAN_ID_MONTHLY", value = var.paypal_plan_id_monthly },
    { name = "PAYPAL_PLAN_ID_ANNUAL", value = var.paypal_plan_id_annual },
    { name = "PAYPAL_WEBHOOK_ID", value = var.paypal_webhook_id },
    { name = "STRIPE_PRICE_ID_MONTHLY", value = var.stripe_price_id_monthly },
    { name = "STRIPE_PRICE_ID_ANNUAL", value = var.stripe_price_id_annual },
  ]

  container_secrets = concat(
    var.cognito_client_secret_arn != "" ? [
      { name = "COGNITO_APP_CLIENT_SECRET", valueFrom = var.cognito_client_secret_arn }
    ] : [],
    var.origin_verify_secret_arn != "" ? [
      { name = "ORIGIN_VERIFY_SECRET", valueFrom = var.origin_verify_secret_arn }
    ] : [],
    var.stripe_secret_key_arn != "" ? [
      { name = "STRIPE_SECRET_KEY", valueFrom = var.stripe_secret_key_arn }
    ] : [],
    var.stripe_webhook_secret_arn != "" ? [
      { name = "STRIPE_WEBHOOK_SECRET", valueFrom = var.stripe_webhook_secret_arn }
    ] : [],
    var.paypal_client_secret_arn != "" ? [
      { name = "PAYPAL_CLIENT_SECRET", valueFrom = var.paypal_client_secret_arn }
    ] : [],
  )
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  container_definitions = jsonencode([{
    name         = "backend"
    image        = "${var.ecr_backend_url}:${var.backend_image_tag}"
    essential    = true
    portMappings = [{ containerPort = var.backend_port, protocol = "tcp" }]
    environment  = local.container_environment
    secrets      = local.container_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/${var.project}-backend"
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])

  tags = { Project = var.project }
}

# ---------- ECS service ----------
resource "aws_ecs_service" "backend" {
  name            = "${var.project}-backend-svc"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.public_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true # no NAT gateway — tasks need public IPs
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = var.backend_port
  }

  depends_on = [aws_lb_listener.https]

  lifecycle {
    ignore_changes = [task_definition] # managed by CI/CD pipeline
  }

  tags = { Project = var.project }
}

# ---------- SNS topic for scaling notifications ----------
resource "aws_sns_topic" "scaling_alerts" {
  name = "${var.project}-ecs-scaling-alerts"
  tags = { Project = var.project }
}

resource "aws_sns_topic_subscription" "scaling_email" {
  topic_arn = aws_sns_topic.scaling_alerts.arn
  protocol  = "email"
  endpoint  = "certshack@gmail.com"
}

# ---------- Application Auto Scaling ----------
resource "aws_appautoscaling_target" "ecs_backend" {
  max_capacity       = 5
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "scale_out" {
  name               = "${var.project}-ecs-scale-out"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.ecs_backend.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_backend.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 60
    metric_aggregation_type = "Average"

    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 1
    }
  }
}

resource "aws_appautoscaling_policy" "scale_in" {
  name               = "${var.project}-ecs-scale-in"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.ecs_backend.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_backend.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 300
    metric_aggregation_type = "Average"

    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${var.project}-ecs-cpu-high"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 70
  alarm_description   = "ECS CPU >= 70% for 1 minute — scale out"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = aws_ecs_service.backend.name
  }

  alarm_actions = [aws_appautoscaling_policy.scale_out.arn, aws_sns_topic.scaling_alerts.arn]
  tags          = { Project = var.project }
}

resource "aws_cloudwatch_metric_alarm" "cpu_low" {
  alarm_name          = "${var.project}-ecs-cpu-low"
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = 5
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 30
  alarm_description   = "ECS CPU <= 30% sustained — scale in"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = aws_ecs_service.backend.name
  }

  alarm_actions = [aws_appautoscaling_policy.scale_in.arn, aws_sns_topic.scaling_alerts.arn]
  tags          = { Project = var.project }
}

# ---------- outputs ----------
output "cluster_arn" {
  value = aws_ecs_cluster.this.arn
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

output "alb_zone_id" {
  value = aws_lb.this.zone_id
}

output "backend_service_name" {
  value = aws_ecs_service.backend.name
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "alb_arn_suffix" {
  value = aws_lb.this.arn_suffix
}

output "target_group_arn_suffix" {
  value = aws_lb_target_group.backend.arn_suffix
}
