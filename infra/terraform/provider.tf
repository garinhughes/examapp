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
  # Use assume-role into the management account. Set `var.mgmt_role_arn` to the
  # role ARN in the mgmt account that this account is allowed to assume.
  assume_role {
    role_arn = var.mgmt_role_arn
  }
}

/*
If you need to create the mgmt role from the mgmt account itself (one-time)
you can temporarily replace the above provider with a profile-based
configuration and run the apply while authenticated to mgmt. Example:

provider "aws" {
  alias   = "mgmt"
  region  = var.region
  profile = var.mgmt_profile
}

*/
