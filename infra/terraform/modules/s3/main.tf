# ---------- variables ----------
variable "project" {
  type    = string
  default = "examapp"
}

variable "bucket_name" {
  type = string
}

variable "account_id" {
  description = "AWS account ID for S3 bucket naming"
  type        = string
}

# ---------- Frontend S3 bucket ----------
resource "aws_s3_bucket" "site" {
  bucket = var.bucket_name
  tags   = { Project = var.project }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------- Exam questions S3 bucket ----------
resource "aws_s3_bucket" "exam_questions" {
  bucket = "${var.project}-exam-questions-${var.account_id}"
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

# ---------- outputs ----------
output "bucket_name" {
  value = aws_s3_bucket.site.id
}

output "bucket_arn" {
  value = aws_s3_bucket.site.arn
}

output "bucket_regional_domain_name" {
  value = aws_s3_bucket.site.bucket_regional_domain_name
}

output "exam_questions_bucket_name" {
  value = aws_s3_bucket.exam_questions.id
}
