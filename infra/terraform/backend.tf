terraform {
  backend "s3" {
    bucket         = "certshack-terraform-state-809472479011-eu-west-1"
    key            = "examapp/terraform.tfstate"
    region         = "eu-west-1"
    encrypt        = true
    dynamodb_table = "certshack-terraform-locks"
  }
}
