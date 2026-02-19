# ---------- variables ----------
variable "project" {
  type    = string
  default = "examapp"
}

variable "table_name" {
  type = string
}

variable "hash_key" {
  type    = string
  default = "PK"
}

variable "range_key" {
  type    = string
  default = "SK"
}

# ---------- table ----------
resource "aws_dynamodb_table" "this" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST" # on-demand — cheapest for low/variable traffic
  hash_key     = var.hash_key
  range_key    = var.range_key

  attribute {
    name = var.hash_key
    type = "S"
  }

  attribute {
    name = var.range_key
    type = "S"
  }

  point_in_time_recovery {
    enabled = false # disable to save cost; enable when needed
  }

  tags = { Project = var.project }
}

# ---------- outputs ----------
output "table_name" {
  value = aws_dynamodb_table.this.name
}

output "table_arn" {
  value = aws_dynamodb_table.this.arn
}
