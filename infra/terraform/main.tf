# ---------- data ----------
data "aws_caller_identity" "current" {}

# ==========================================================================
# ACM certificates
# ==========================================================================

# CloudFront cert — must be us-east-1
resource "aws_acm_certificate" "cloudfront" {
  provider                  = aws.useast1
  domain_name               = var.domain
  subject_alternative_names = ["www.${var.domain}"]
  validation_method         = "DNS"
  tags                      = { Project = var.project }
  lifecycle { create_before_destroy = true }
}

# ALB cert — eu-west-1
resource "aws_acm_certificate" "alb" {
  domain_name       = "api.${var.domain}"
  validation_method = "DNS"
  tags              = { Project = var.project }
  lifecycle { create_before_destroy = true }
}

# ---------- DNS validation via mgmt-account Route53 ----------
data "aws_route53_zone" "main" {
  provider = aws.mgmt
  name     = "${var.domain}."
}

locals {
  # Merge validation options from both certs, dedup by domain_name
  all_cert_dvos = merge(
    { for dvo in aws_acm_certificate.cloudfront.domain_validation_options :
      dvo.domain_name => dvo },
    { for dvo in aws_acm_certificate.alb.domain_validation_options :
      dvo.domain_name => dvo },
  )
}

resource "aws_route53_record" "acm_validation" {
  provider = aws.mgmt
  for_each = local.all_cert_dvos

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  ttl     = 60
  records = [each.value.resource_record_value]

  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider                = aws.useast1
  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options :
    dvo.resource_record_name
  ]
  depends_on = [aws_route53_record.acm_validation]
}

resource "aws_acm_certificate_validation" "alb" {
  certificate_arn         = aws_acm_certificate.alb.arn
  validation_record_fqdns = [
    for dvo in aws_acm_certificate.alb.domain_validation_options :
    dvo.resource_record_name
  ]
  depends_on = [aws_route53_record.acm_validation]
}

# ==========================================================================
# Modules
# ==========================================================================

module "vpc" {
  source   = "./modules/vpc"
  project  = var.project
  region   = var.region
  vpc_cidr = "10.0.0.0/16"
  az_count = 2
}

module "iam" {
  source     = "./modules/iam"
  project    = var.project
  account_id = data.aws_caller_identity.current.account_id
}

# GitHub Actions role for OIDC-based assumes
module "github_actions" {
  source          = "./modules/github_actions"
  project         = var.project
  account_id      = data.aws_caller_identity.current.account_id
  github_org_repo = var.github_repo
  # github_environment left as default '*' unless you want to lock to a specific environment
}

module "ecr" {
  source       = "./modules/ecr"
  project      = var.project
  repositories = ["examapp-backend"]
}

module "dynamodb" {
  source     = "./modules/dynamodb"
  project    = var.project
  table_name = "${var.project}-sessions"
}

# DynamoDB table for attempts (userId PK, attemptId SK)
module "dynamodb_attempts" {
  source     = "./modules/dynamodb"
  project    = var.project
  table_name = "${var.project}-attempts"
  hash_key   = "userId"
  range_key  = "attemptId"
}

# DynamoDB table for gamification (persistent production store)
module "dynamodb_gamification" {
  source     = "./modules/dynamodb"
  project    = var.project
  table_name = "${var.project}-gamification"
  hash_key   = "userId"
  # no range key required for per-user records; use module default for SK if needed
}

module "s3_cloudfront" {
  source              = "./modules/s3_cloudfront"
  project             = var.project
  domain              = var.domain
  bucket_name         = "${var.project}-frontend-${data.aws_caller_identity.current.account_id}"
  acm_certificate_arn = aws_acm_certificate_validation.cloudfront.certificate_arn
  web_acl_arn         = aws_wafv2_web_acl.restrict_my_ip.arn

  depends_on = [aws_acm_certificate_validation.cloudfront]
}

module "ecs" {
  source                     = "./modules/ecs"
  project                    = var.project
  region                     = var.region
  vpc_id                     = module.vpc.vpc_id
  public_subnet_ids          = module.vpc.public_subnet_ids
  ecs_task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  ecs_task_role_arn           = module.iam.ecs_task_role_arn
  ecr_backend_url            = module.ecr.repository_urls["examapp-backend"]
  acm_certificate_arn        = aws_acm_certificate_validation.alb.certificate_arn
  dynamodb_table_name        = module.dynamodb.table_name
  desired_count              = 1   # set to 0 to save cost until ready
  cpu                        = 256 # 0.25 vCPU — smallest Fargate
  memory                     = 512 # minimum for 256 CPU
  
  # Environment values copied from working ecs task definition
  exam_source               = "s3"
  s3_bucket                = aws_s3_bucket.exam_questions.id
  exams_index_table        = aws_dynamodb_table.exams_index.name
  attempts_table           = module.dynamodb_attempts.table_name
  gam_table                = module.dynamodb_gamification.table_name
  users_table              = aws_dynamodb_table.users.name
  entitlements_table       = aws_dynamodb_table.entitlements.name
  audit_table              = aws_dynamodb_table.audit.name

  cognito_domain           = "eu-west-1c6wqup1rx.auth.eu-west-1.amazoncognito.com"
  cognito_app_client_id    = "2b10tfhn1k9pq9rr5f6k14usc3"
  cognito_region           = var.region
  cognito_user_pool_id     = "eu-west-1_c6WQUP1RX"
  cognito_redirect_uri     = "https://api.certshack.com/auth/token"
  frontend_origin          = "https://certshack.com"
  # Wire in the certshack-managed secret (created below)
  cognito_client_secret_arn = aws_secretsmanager_secret.cognito_client_secret.arn

  depends_on = [aws_acm_certificate_validation.alb]
}

# ---------- Secrets Manager: Cognito client secret (value managed out-of-band)
resource "aws_secretsmanager_secret" "cognito_client_secret" {
  name        = "${var.project}-cognito-client-secret"
  description = "Cognito app client secret for ${var.project} (certshack account)"
  tags        = { Project = var.project }

  # The secret value is set via AWS CLI / console — not managed by Terraform.
  # This avoids Terraform overwriting the real Cognito secret on every apply.
  lifecycle { ignore_changes = [tags] }
}

# Allow the ECS task execution role to read the secret
resource "aws_secretsmanager_secret_policy" "cognito_client_secret_policy" {
  secret_arn = aws_secretsmanager_secret.cognito_client_secret.arn
  policy     = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid = "AllowEcsTaskGetSecret",
        Effect = "Allow",
        Principal = { AWS = module.iam.ecs_task_execution_role_arn },
        Action = ["secretsmanager:GetSecretValue","secretsmanager:DescribeSecret"],
        Resource = aws_secretsmanager_secret.cognito_client_secret.arn
      }
    ]
  })
}

# ---------- S3 bucket for exam question assets
resource "aws_s3_bucket" "exam_questions" {
  bucket = "${var.project}-exam-questions-${data.aws_caller_identity.current.account_id}"
  tags   = { Project = var.project }
}

resource "aws_s3_bucket_public_access_block" "exam_questions_block" {
  bucket                  = aws_s3_bucket.exam_questions.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "exam_questions_versioning" {
  bucket = aws_s3_bucket.exam_questions.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ---------- DynamoDB tables used by the backend ----------

# examapp-users: hash = userId (Cognito sub)
resource "aws_dynamodb_table" "users" {
  name         = "${var.project}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  tags = { Project = var.project }
}

# examapp-exams-index: hash = examCode
resource "aws_dynamodb_table" "exams_index" {
  name         = "${var.project}-exams-index"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "examCode"

  attribute {
    name = "examCode"
    type = "S"
  }

  tags = { Project = var.project }
}

# examapp-entitlements: hash = userId, range = productId
resource "aws_dynamodb_table" "entitlements" {
  name         = "${var.project}-entitlements"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "productId"

  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "productId"
    type = "S"
  }

  tags = { Project = var.project }
}

# examapp-audit: hash = adminId, range = createdAt
resource "aws_dynamodb_table" "audit" {
  name         = "${var.project}-audit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "adminId"
  range_key    = "createdAt"

  attribute {
    name = "adminId"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }

  tags = { Project = var.project }
}

# ==========================================================================
# DNS records — point domain to CloudFront / ALB (mgmt-account Route53)
# ==========================================================================

# ---------- CloudWatch Dashboard ----------
resource "aws_cloudwatch_dashboard" "certshack_examapp" {
  dashboard_name = "certshack-examapp"

  dashboard_body = templatefile("${path.module}/dashboards/certshack-examapp.json.tftpl", {
    region              = var.region
    project             = var.project
    alb_arn_suffix      = module.ecs.alb_arn_suffix
    tg_arn_suffix       = module.ecs.target_group_arn_suffix
    ecs_cluster_name    = module.ecs.cluster_name
    ecs_service_name    = module.ecs.backend_service_name
    cf_distribution_id  = module.s3_cloudfront.cloudfront_distribution_id
    log_group           = "/ecs/${var.project}-backend"
    table_users         = aws_dynamodb_table.users.name
    table_entitlements  = aws_dynamodb_table.entitlements.name
    table_attempts      = module.dynamodb_attempts.table_name
    table_exams_index   = aws_dynamodb_table.exams_index.name
    table_audit         = aws_dynamodb_table.audit.name
    table_gamification  = module.dynamodb_gamification.table_name
    api_url             = module.apigw_itemcount.invoke_url
  })
}

# ---------- Lambda: publish DynamoDB ItemCount as custom CloudWatch metrics ----------
data "archive_file" "itemcount_zip" {
  type        = "zip"
  source_file = "${path.module}/lambdas/dynamodb_itemcount_publisher.py"
  output_path = "${path.module}/lambdas/dynamodb_itemcount_publisher.zip"
}

resource "aws_iam_role" "itemcount_lambda_role" {
  name = "${var.project}-itemcount-publisher-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "itemcount_lambda_policy" {
  name = "${var.project}-itemcount-publisher-policy"
  role = aws_iam_role.itemcount_lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "dynamodb:DescribeTable",
          "dynamodb:Scan"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "cloudwatch:PutMetricData"
        ],
        Resource = "*"
      },
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "itemcount_publisher" {
  filename         = data.archive_file.itemcount_zip.output_path
  function_name    = "${var.project}-dynamodb-itemcount-publisher"
  role             = aws_iam_role.itemcount_lambda_role.arn
  handler          = "dynamodb_itemcount_publisher.lambda_handler"
  runtime          = "python3.11"
  timeout          = 30

  environment {
    variables = {
      TABLES    = join(",", [aws_dynamodb_table.users.name, aws_dynamodb_table.entitlements.name, module.dynamodb_attempts.table_name, aws_dynamodb_table.exams_index.name, aws_dynamodb_table.audit.name, module.dynamodb_gamification.table_name])
      NAMESPACE = "${var.project}/DynamoDB"
    }
  }

  depends_on = [aws_iam_role_policy.itemcount_lambda_policy]
}

# Public function URL so dashboard can trigger the publisher via HTTPS
resource "aws_lambda_function_url" "itemcount" {
  function_name     = aws_lambda_function.itemcount_publisher.function_name
  authorization_type = "AWS_IAM"
}

# Move API Gateway resources into a reusable module
module "apigw_itemcount" {
  source               = "./modules/apigw"
  project              = var.project
  region               = var.region
  lambda_arn           = aws_lambda_function.itemcount_publisher.arn
  lambda_function_name = aws_lambda_function.itemcount_publisher.function_name
  stage_name           = "prod"
  api_name             = "examapp-api"
  resource_path        = "v1/metrics/itemcount"
}

resource "aws_cloudwatch_event_rule" "itemcount_schedule" {
  name                = "examapp-eb-itemcount-scheduler"
  schedule_expression = "rate(30 minutes)"
}

resource "aws_cloudwatch_event_target" "itemcount_target" {
  rule      = aws_cloudwatch_event_rule.itemcount_schedule.name
  target_id = "ItemCountPublisher"
  arn       = aws_lambda_function.itemcount_publisher.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.itemcount_publisher.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.itemcount_schedule.arn
}

resource "aws_route53_record" "apex" {
  provider        = aws.mgmt
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = var.domain
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  provider        = aws.mgmt
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = "www.${var.domain}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  provider        = aws.mgmt
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = "api.${var.domain}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = module.ecs.alb_dns_name
    zone_id                = module.ecs.alb_zone_id
    evaluate_target_health = true
  }
}

# ---------- WAFv2: restrict CloudFront to a single IP
resource "aws_wafv2_ip_set" "my_ip" {
  provider = aws.useast1
  name     = "${var.project}-my-ip"
  scope    = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses = [
    "185.77.56.49/32"
  ]
}

resource "aws_wafv2_web_acl" "restrict_my_ip" {
  provider = aws.useast1
  name     = "${var.project}-restrict-my-ip"
  scope    = "CLOUDFRONT"

  default_action {
    block {}
  }

  rule {
    name     = "allow-my-ip"
    priority = 1
    action {
      allow {}
    }
    statement {
      ip_set_reference_statement {
        arn = aws_wafv2_ip_set.my_ip.arn
      }
    }
    visibility_config {
      sampled_requests_enabled   = false
      cloudwatch_metrics_enabled = true
      metric_name                = "allow_my_ip"
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "examapp-waf"
    sampled_requests_enabled   = false
  }
}