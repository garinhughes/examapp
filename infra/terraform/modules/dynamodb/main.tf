variable "project" {
  type    = string
  default = "examapp"
}

variable "tables" {
  description = "Map of table configurations keyed by logical name. Each value is an object with keys: table_name (string), hash_key (string), optional range_key (string)."
  type        = map(any)
  default     = {}
}

# Create one aws_dynamodb_table per entry in var.tables
resource "aws_dynamodb_table" "this" {
  for_each     = var.tables
  name         = each.value.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash_key
  range_key    = lookup(each.value, "range_key", "") != "" ? lookup(each.value, "range_key", "") : null

  attribute {
    name = each.value.hash_key
    type = "S"
  }

  dynamic "attribute" {
    for_each = lookup(each.value, "range_key", "") != "" ? [lookup(each.value, "range_key", "")] : []
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "ttl" {
    for_each = lookup(each.value, "ttl_attribute", "") != "" ? [lookup(each.value, "ttl_attribute", "")] : []
    content {
      attribute_name = ttl.value
      enabled        = true
    }
  }

  point_in_time_recovery { enabled = false }
  tags = { Project = var.project }
}

# Outputs as maps keyed by the logical table key
output "table_names" {
  value = { for k, v in aws_dynamodb_table.this : k => v.name }
}

output "table_arns" {
  value = { for k, v in aws_dynamodb_table.this : k => v.arn }
}
