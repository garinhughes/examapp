# ---------- data ----------
data "aws_caller_identity" "current" {}

# Route53 zone for the domain
data "aws_route53_zone" "main" {
  name = var.domain
}

# ==========================================================================
# ACM Certificates (CloudFront and ALB)
# ==========================================================================
module "acm" {
  source  = "./modules/acm"
  project = var.project
  domain  = var.domain

  providers = {
    aws         = aws
    aws.useast1 = aws.useast1
  }
}

# Collect all cert domain validation options for Route53 records
locals {
  all_cert_dvos = merge(
    { for dvo in module.acm.cloudfront_domain_validation_options : dvo.domain_name => {
      resource_record_name  = dvo.resource_record_name
      resource_record_type  = dvo.resource_record_type
      resource_record_value = dvo.resource_record_value
    } },
    { for dvo in module.acm.alb_domain_validation_options : dvo.domain_name => {
      resource_record_name  = dvo.resource_record_name
      resource_record_type  = dvo.resource_record_type
      resource_record_value = dvo.resource_record_value
    } }
  )
}

module "vpc" {
  source  = "./modules/vpc"
  project = var.project
  region  = var.region
}

module "iam" {
  source     = "./modules/iam"
  project    = var.project
  account_id = data.aws_caller_identity.current.account_id
}

module "github_actions" {
  source              = "./modules/github_actions"
  project             = var.project
  account_id          = data.aws_caller_identity.current.account_id
  github_org_repo     = var.github_repo
}

module "ecr" {
  source       = "./modules/ecr"
  project      = var.project
  repositories = ["examapp-backend"]
}

module "dynamodb" {
  source  = "./modules/dynamodb"
  project = var.project
  tables = {
    users        = { table_name = "${var.project}-users",        hash_key = "userId" }
    attempts     = { table_name = "${var.project}-attempts",     hash_key = "userId",   range_key = "attemptId" }
    gamification = { table_name = "${var.project}-gamification", hash_key = "userId",   range_key = "SK" }
    exams_index  = { table_name = "${var.project}-exams-index",  hash_key = "examCode" }
    entitlements = { table_name = "${var.project}-entitlements", hash_key = "userId",   range_key = "productId" }
    audit        = { table_name = "${var.project}-audit",        hash_key = "adminId",  range_key = "createdAt" }
    sessions     = { table_name = "${var.project}-sessions",     hash_key = "PK",       range_key = "SK", ttl_attribute = "ttl" }
    skill_labs_index    = { table_name = "${var.project}-skill-labs-index",    hash_key = "labId" }
    skill_lab_attempts  = { table_name = "${var.project}-skill-lab-attempts",  hash_key = "userId", range_key = "attemptId" }
    issue_reports       = { table_name = "${var.project}-issue-reports",       hash_key = "reportId" }
    metrics             = { table_name = "${var.project}-metrics",             hash_key = "pk",      range_key = "sk" }
    interactions        = { table_name = "${var.project}-interactions",        hash_key = "userId",  range_key = "SK" }
  }
}

module "s3" {
  source      = "./modules/s3"
  project     = var.project
  bucket_name = "${var.project}-frontend-${data.aws_caller_identity.current.account_id}"
  account_id  = data.aws_caller_identity.current.account_id
}

module "cloudfront" {
  source                         = "./modules/cloudfront"
  project                        = var.project
  domain                         = var.domain
  acm_certificate_arn            = module.acm.cloudfront_certificate_arn
  web_acl_arn                    = module.waf.web_acl_arn
  s3_bucket_id                   = module.s3.bucket_name
  s3_bucket_arn                  = module.s3.bucket_arn
  s3_bucket_regional_domain_name = module.s3.bucket_regional_domain_name

  depends_on = [module.acm]
}

# Create route53 aliases after CloudFront and ALB exist
module "route53_aliases" {
  source                    = "./modules/route53"
  project                   = var.project
  zone_id                   = data.aws_route53_zone.main.zone_id
  domain                    = var.domain
  cloudfront_domain_name    = module.cloudfront.cloudfront_domain_name
  cloudfront_hosted_zone_id = module.cloudfront.cloudfront_hosted_zone_id
  alb_dns_name              = module.ecs.alb_dns_name
  alb_zone_id               = module.ecs.alb_zone_id
  create_aliases            = true
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
  acm_certificate_arn        = module.acm.alb_certificate_arn
  dynamodb_table_name        = module.dynamodb.table_names["sessions"]
  desired_count              = 1   # set to 0 to save cost until ready
  cpu                        = 256 # 0.25 vCPU — smallest Fargate
  memory                     = 512 # minimum for 256 CPU

  # Environment values copied from working ecs task definition
  exam_source               = "s3"
  s3_bucket                = module.s3.exam_questions_bucket_name
  exams_index_table        = module.dynamodb.table_names["exams_index"]
  attempts_table           = module.dynamodb.table_names["attempts"]
  gam_table                = module.dynamodb.table_names["gamification"]
  users_table              = module.dynamodb.table_names["users"]
  entitlements_table       = module.dynamodb.table_names["entitlements"]
  audit_table              = module.dynamodb.table_names["audit"]
  skill_lab_source         = "s3"
  skill_lab_s3_bucket      = module.s3.skill_labs_bucket_name
  skill_lab_index_table    = module.dynamodb.table_names["skill_labs_index"]
  skill_lab_attempts_table = module.dynamodb.table_names["skill_lab_attempts"]

  cognito_domain           = "eu-west-1c6wqup1rx.auth.eu-west-1.amazoncognito.com"
  cognito_app_client_id    = "2b10tfhn1k9pq9rr5f6k14usc3"
  cognito_region           = var.region
  cognito_user_pool_id     = "eu-west-1_c6WQUP1RX"
  cognito_redirect_uri     = "https://api.certshack.com/auth/token"
  frontend_origin          = "https://certshack.com"
  # Wire in the certshack-managed secret (created in secretsmanager module)
  cognito_client_secret_arn = module.secretsmanager.cognito_client_secret_arn

  ses_from_address    = "noreply@certshack.com"
  ses_support_address = "support@certshack.com"
  issue_reports_table = module.dynamodb.table_names["issue_reports"]
  metrics_table       = module.dynamodb.table_names["metrics"]
  interactions_table  = module.dynamodb.table_names["interactions"]

  depends_on = [module.acm]
}

# Secrets Manager for Cognito client secret
module "secretsmanager" {
  source                       = "./modules/secretsmanager"
  project                      = var.project
  ecs_task_execution_role_arn  = module.iam.ecs_task_execution_role_arn
}

# ==========================================================================
# DNS records — point domain to CloudFront / ALB
# ==========================================================================

# ---------- Lambda: publish DynamoDB ItemCount as custom CloudWatch metrics ----------
data "archive_file" "itemcount_zip" {
  type        = "zip"
  source_file = "${path.module}/lambdas/dynamodb_itemcount_publisher.py"
  output_path = "${path.module}/.terraform/lambdas/dynamodb_itemcount_publisher.zip"
}

# CloudWatch EventBridge scheduler for Lambda
module "cloudwatch_scheduler" {
  source         = "./modules/cloudwatch"
  project        = var.project
  schedule_rate  = "rate(30 minutes)"
  lambda_arn     = module.lambda.function_arn
  region         = var.region
  dashboard_template_path = "${path.module}/dashboards/certshack-examapp.json.tftpl"
  dashboard_vars = {
    region              = var.region
    project             = var.project
    alb_arn_suffix      = module.ecs.alb_arn_suffix
    tg_arn_suffix       = module.ecs.target_group_arn_suffix
    ecs_cluster_name    = module.ecs.cluster_name
    ecs_service_name    = module.ecs.backend_service_name
    cf_distribution_id  = module.cloudfront.cloudfront_distribution_id
    log_group           = "/ecs/${var.project}-backend"
    table_users         = module.dynamodb.table_names["users"]
    table_entitlements  = module.dynamodb.table_names["entitlements"]
    table_attempts      = module.dynamodb.table_names["attempts"]
    table_exams_index   = module.dynamodb.table_names["exams_index"]
    table_audit         = module.dynamodb.table_names["audit"]
    table_gamification  = module.dynamodb.table_names["gamification"]
    api_url             = module.apigw_itemcount.invoke_url
  }
}

# Lambda function for publishing DynamoDB item counts
module "lambda" {
  source           = "./modules/lambda"
  project          = var.project
  lambda_zip       = data.archive_file.itemcount_zip.output_path
  tables_csv       = join(",", [module.dynamodb.table_names["users"], module.dynamodb.table_names["entitlements"], module.dynamodb.table_names["attempts"], module.dynamodb.table_names["exams_index"], module.dynamodb.table_names["audit"], module.dynamodb.table_names["gamification"]])
  lambda_role_arn  = module.iam.lambda_itemcount_role_arn
  event_rule_arn   = module.cloudwatch_scheduler.event_rule_arn
}

module "apigw_itemcount" {
  source               = "./modules/apigw"
  project              = var.project
  region               = var.region
  lambda_arn           = module.lambda.function_arn
  lambda_function_name = module.lambda.function_name
  stage_name           = "prod"
  api_name             = "examapp-api"
  resource_path        = "v1/metrics/itemcount"
}

module "route53" {
  source                  = "./modules/route53"
  project                 = var.project
  zone_id                 = data.aws_route53_zone.main.zone_id
  domain                  = var.domain
  acm_dvos                = local.all_cert_dvos
}

# ==========================================================================
# PayPal / Apple Pay: domain verification file served via CloudFront + S3
# ==========================================================================
# Upload the domain association file that Apple requires for Apple Pay.
# Content is sourced from infra/terraform/apple-developer-merchantid-domain-association
# (no file extension). Obtain this file from the PayPal dashboard after
# registering your domain for Apple Pay under Payment Methods → Apple Pay.
resource "aws_s3_object" "apple_pay_domain_association" {
  bucket       = module.s3.bucket_name
  key          = ".well-known/apple-developer-merchantid-domain-association"
  source       = "${path.module}/apple-developer-merchantid-domain-association"
  content_type = "application/json"
  etag         = filemd5("${path.module}/apple-developer-merchantid-domain-association")
}


module "ses" {
  source  = "./modules/ses"
  project = var.project
  domain  = var.domain
  zone_id = data.aws_route53_zone.main.zone_id
}

module "waf" {
  source     = "./modules/waf"
  project    = var.project
  enable_waf = var.enable_waf
  addresses  = [
    "185.77.56.49/32",
    "86.8.179.69/32",
    "185.124.2.141/32",
    "131.251.24.249/32",
  ]
}
