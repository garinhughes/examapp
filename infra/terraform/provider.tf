terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
  required_version = ">= 1.0"
}

# Default provider — certshack account, eu-west-1
provider "aws" {
  region = var.region
}

# CloudFront ACM certs must be in us-east-1
provider "aws" {
  alias  = "useast1"
  region = "us-east-1"
}

# Management account — Route53 hosted zone lives here
provider "aws" {
  alias   = "mgmt"
  region  = var.region
  profile = "mgmt"
}
