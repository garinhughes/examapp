provider "aws" {
  region = var.region
}

module "iam" {
  source = "../modules/iam"
  deploy_role_name = "certshack-deploy-role"
}

module "dynamodb_users" {
  source = "../modules/dynamodb"
  name   = "examapp-users"
  hash_key = "user_id"
}
