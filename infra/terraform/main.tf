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
  source                 = "./modules/iam"
  project                = var.project
  account_id             = data.aws_caller_identity.current.account_id
  cognito_admin_role_arn = var.cognito_admin_role_arn
}

module "github_actions" {
  source          = "./modules/github_actions"
  project         = var.project
  account_id      = data.aws_caller_identity.current.account_id
  github_org_repo = var.github_repo
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
    users = { table_name = "${var.project}-users", hash_key = "userId", pitr = true }
    attempts = {
      table_name = "${var.project}-attempts"
      hash_key   = "userId"
      range_key  = "attemptId"
      pitr       = true
      gsis = [
        { name = "status-index", hash_key = "userId", range_key = "status", projection_type = "ALL" }
      ]
    }
    gamification       = { table_name = "${var.project}-gamification", hash_key = "userId", range_key = "SK", pitr = true }
    exams_index        = { table_name = "${var.project}-exams-index", hash_key = "examCode" }
    entitlements       = { table_name = "${var.project}-entitlements", hash_key = "userId", range_key = "productId", pitr = true }
    audit              = { table_name = "${var.project}-audit", hash_key = "adminId", range_key = "createdAt", pitr = true }
    sessions           = { table_name = "${var.project}-sessions", hash_key = "PK", range_key = "SK", ttl_attribute = "ttl" }
    skill_labs_index   = { table_name = "${var.project}-skill-labs-index", hash_key = "labId" }
    skill_lab_attempts = {
      table_name = "${var.project}-skill-lab-attempts"
      hash_key   = "userId"
      range_key  = "attemptId"
      pitr       = true
      gsis = [
        # Lifecycle redesign (dev-guide §15 / 14.8) — find a user's in_progress
        # attempts in one query instead of scanning all rows.
        { name = "status-index", hash_key = "userId", range_key = "status", projection_type = "ALL" }
      ]
    }
    issue_reports      = { table_name = "${var.project}-issue-reports", hash_key = "reportId" }
    metrics            = { table_name = "${var.project}-metrics", hash_key = "pk", range_key = "sk" }
    interactions       = { table_name = "${var.project}-interactions", hash_key = "userId", range_key = "SK", pitr = true }
    email_templates    = { table_name = "${var.project}-email-templates", hash_key = "templateId" }
    email_logs         = { table_name = "${var.project}-email-logs", hash_key = "logId" }
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

# SES DKIM records for management-account SES identity (certshack.com)
resource "aws_route53_record" "ses_dkim" {
  for_each = toset([
    "wxdsv7nctabtpuyogiumg6riaghlahwx",
    "frx5cxu7lcxyqfprmd2756bbrwm2yxh2",
    "5t47p6sfbz332ohvuy5vlchm2ocgydrj",
  ])

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = "${each.value}._domainkey.${var.domain}"
  type            = "CNAME"
  ttl             = 300
  records         = ["${each.value}.dkim.amazonses.com"]
  allow_overwrite = true
}

module "ecs" {
  source                      = "./modules/ecs"
  project                     = var.project
  region                      = var.region
  vpc_id                      = module.vpc.vpc_id
  public_subnet_ids           = module.vpc.public_subnet_ids
  ecs_task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  ecs_task_role_arn           = module.iam.ecs_task_role_arn
  ecr_backend_url             = module.ecr.repository_urls["examapp-backend"]
  acm_certificate_arn         = module.acm.alb_certificate_arn
  dynamodb_table_name         = module.dynamodb.table_names["sessions"]
  desired_count               = 1   # set to 0 to save cost until ready
  cpu                         = 256 # 0.25 vCPU — smallest Fargate
  memory                      = 512 # minimum for 256 CPU

  # Environment values copied from working ecs task definition
  exam_source              = "s3"
  s3_bucket                = module.s3.exam_questions_bucket_name
  exams_index_table        = module.dynamodb.table_names["exams_index"]
  attempts_table           = module.dynamodb.table_names["attempts"]
  gam_table                = module.dynamodb.table_names["gamification"]
  users_table              = module.dynamodb.table_names["users"]
  entitlements_table       = module.dynamodb.table_names["entitlements"]
  audit_table              = module.dynamodb.table_names["audit"]
  images_s3_bucket         = module.s3.images_bucket_name
  skill_lab_source         = "s3"
  skill_lab_s3_bucket      = module.s3.skill_labs_bucket_name
  skill_lab_index_table    = module.dynamodb.table_names["skill_labs_index"]
  skill_lab_attempts_table = module.dynamodb.table_names["skill_lab_attempts"]

  cognito_domain        = "eu-west-1c6wqup1rx.auth.eu-west-1.amazoncognito.com"
  cognito_app_client_id = "2b10tfhn1k9pq9rr5f6k14usc3"
  cognito_region        = var.region
  cognito_user_pool_id  = "eu-west-1_c6WQUP1RX"
  cognito_redirect_uri  = "https://api.certshack.com/auth/token"
  frontend_origin       = "https://certshack.com"
  backend_origin        = "https://api.certshack.com"
  # Wire in the certshack-managed secrets (created in secretsmanager module)
  cognito_client_secret_arn = module.secretsmanager.cognito_client_secret_arn

  cognito_admin_role_arn = var.cognito_admin_role_arn
  ses_from_address       = "noreply@certshack.com"
  ses_support_address    = "support@certshack.com"
  ses_outreach_address   = "outreach@certshack.com"
  issue_reports_table    = module.dynamodb.table_names["issue_reports"]
  metrics_table          = module.dynamodb.table_names["metrics"]
  interactions_table     = module.dynamodb.table_names["interactions"]
  email_templates_table  = module.dynamodb.table_names["email_templates"]
  email_logs_table       = module.dynamodb.table_names["email_logs"]

  paypal_client_id                 = "AbyHVazM-r_fPb1CgQa0j5nwTtdMawkxoHGa2Dxd9PavViGd1G4Z0qTiHONgx1hUMC7ONUYKLBbrU4wa"
  paypal_api_base                  = "https://api-m.paypal.com"
  paypal_plan_id_pro_monthly       = "" # Set after creating PayPal billing plan for Pro
  paypal_plan_id_pro_plus_monthly  = "" # Set after creating PayPal billing plan for Pro Plus
  paypal_plan_id_pro_discount      = "" # Set when running a promotion (discounted Pro plan)
  paypal_plan_id_pro_plus_discount = "" # Set when running a promotion (discounted Pro Plus plan)
  paypal_webhook_id                = "5H458344BE202643E"
  paypal_client_secret_arn         = module.secretsmanager.paypal_client_secret_arn
  stripe_secret_key_arn            = module.secretsmanager.stripe_secret_key_arn
  stripe_webhook_secret_arn        = module.secretsmanager.stripe_webhook_secret_arn
  cron_secret                      = module.secretsmanager.cron_secret_arn
  unsubscribe_secret               = module.secretsmanager.unsubscribe_secret_arn
  stripe_price_id_pro_monthly      = "" # Set after creating Stripe recurring Price for Pro
  stripe_price_id_pro_plus_monthly = "" # Set after creating Stripe recurring Price for Pro Plus
  discount_active                  = "false"
  stripe_coupon_id_discount        = "" # Set when running a promotion

  depends_on = [module.acm]
}

# Secrets Manager for Cognito client secret and origin-verify header
module "secretsmanager" {
  source                      = "./modules/secretsmanager"
  project                     = var.project
  ecs_task_execution_role_arn = module.iam.ecs_task_execution_role_arn
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
  source                  = "./modules/cloudwatch"
  project                 = var.project
  schedule_rate           = "rate(30 minutes)"
  lambda_arn              = module.lambda.function_arn
  region                  = var.region
  dashboard_template_path = "${path.module}/dashboards/certshack-examapp.json.tftpl"
  dashboard_vars = {
    region             = var.region
    project            = var.project
    account_id         = data.aws_caller_identity.current.account_id
    alb_arn_suffix     = module.ecs.alb_arn_suffix
    tg_arn_suffix      = module.ecs.target_group_arn_suffix
    ecs_cluster_name   = module.ecs.cluster_name
    ecs_service_name   = module.ecs.backend_service_name
    cf_distribution_id = module.cloudfront.cloudfront_distribution_id
    log_group          = "/ecs/${var.project}-backend"
    table_users        = module.dynamodb.table_names["users"]
    table_entitlements = module.dynamodb.table_names["entitlements"]
    table_attempts     = module.dynamodb.table_names["attempts"]
    table_exams_index  = module.dynamodb.table_names["exams_index"]
    table_audit        = module.dynamodb.table_names["audit"]
    table_gamification = module.dynamodb.table_names["gamification"]
    api_url            = module.apigw_itemcount.invoke_url
  }
}

# Lambda function for publishing DynamoDB item counts
module "lambda" {
  source          = "./modules/lambda"
  project         = var.project
  lambda_zip      = data.archive_file.itemcount_zip.output_path
  tables_csv      = join(",", [module.dynamodb.table_names["users"], module.dynamodb.table_names["entitlements"], module.dynamodb.table_names["attempts"], module.dynamodb.table_names["exams_index"], module.dynamodb.table_names["audit"], module.dynamodb.table_names["gamification"]])
  lambda_role_arn = module.iam.lambda_itemcount_role_arn
  event_rule_arn  = module.cloudwatch_scheduler.event_rule_arn
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
  source              = "./modules/route53"
  project             = var.project
  zone_id             = data.aws_route53_zone.main.zone_id
  domain              = var.domain
  acm_dvos            = local.all_cert_dvos
  create_mail_records = true
  apex_txt_records = [
    "v=spf1 include:zohomail.eu include:amazonses.com ~all",
    "google-site-verification=0CAvqJgA__ZRdb5ba9fHnGEB_94h1DOj-OU-XXBEbvY",
    "zoho-verification=zb15270861.zmverify.zoho.eu",
  ]
}

module "ses" {
  source  = "./modules/ses"
  project = var.project
  domain  = var.domain
  zone_id = data.aws_route53_zone.main.zone_id
}

module "waf" {
  source  = "./modules/waf"
  project = var.project

  providers = {
    aws.useast1 = aws.useast1
  }
}
