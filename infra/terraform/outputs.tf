# ==========================================================================
# Key outputs
# ==========================================================================

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "public_subnet_ids" {
  value = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.vpc.private_subnet_ids
}

output "ecr_repository_urls" {
  value = module.ecr.repository_urls
}

output "dynamodb_table_name" {
  value = module.dynamodb.table_name
}

output "cloudfront_domain_name" {
  value = module.s3_cloudfront.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  value = module.s3_cloudfront.cloudfront_distribution_id
}

output "frontend_bucket_name" {
  value = module.s3_cloudfront.bucket_name
}

output "alb_dns_name" {
  value = module.ecs.alb_dns_name
}

output "ecs_cluster_arn" {
  value = module.ecs.cluster_arn
}

output "ecs_backend_service" {
  value = module.ecs.backend_service_name
}

output "github_actions_role_arn" {
  description = "ARN of the IAM role GitHub Actions will assume"
  value       = module.github_actions.role_arn
}

output "github_actions_role_name" {
  description = "Name of the IAM role for GitHub Actions"
  value       = module.github_actions.role_name
}
