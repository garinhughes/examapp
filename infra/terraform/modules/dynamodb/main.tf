variable "project" {
  type    = string
  default = "examapp"
}

variable "tables" {
  description = "Map of table configurations keyed by logical name. Each value is an object with keys: table_name (string), hash_key (string), optional range_key (string), optional ttl_attribute (string), optional gsis (list of objects with name/hash_key/optional range_key/optional projection_type)."
  type        = any
  default     = {}
}

locals {
  # Flatten all GSI attributes (hash + optional range) declared across all tables so we can
  # register them at the top level. DynamoDB requires every key attribute (table keys + GSI keys)
  # to be declared in the attribute block.
  gsi_attributes = { for k, v in var.tables : k => distinct(flatten([
    for g in lookup(v, "gsis", []) : concat(
      [g.hash_key],
      lookup(g, "range_key", "") != "" ? [g.range_key] : []
    )
  ])) }
}

# Create one aws_dynamodb_table per entry in var.tables
resource "aws_dynamodb_table" "this" {
  for_each     = var.tables
  name         = each.value.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key  = each.value.hash_key
  range_key = lookup(each.value, "range_key", "") != "" ? lookup(each.value, "range_key", "") : null

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

  # Declare attributes used only by GSIs (table key attributes are declared above;
  # we filter them out here so we don't duplicate).
  dynamic "attribute" {
    for_each = toset([
      for a in lookup(local.gsi_attributes, each.key, []) :
      a if a != each.value.hash_key && a != lookup(each.value, "range_key", "")
    ])
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "global_secondary_index" {
    for_each = lookup(each.value, "gsis", [])
    content {
      name            = global_secondary_index.value.name
      projection_type = lookup(global_secondary_index.value, "projection_type", "ALL")

      key_schema {
        attribute_name = global_secondary_index.value.hash_key
        key_type       = "HASH"
      }

      dynamic "key_schema" {
        for_each = lookup(global_secondary_index.value, "range_key", "") != "" ? [global_secondary_index.value.range_key] : []
        content {
          attribute_name = key_schema.value
          key_type       = "RANGE"
        }
      }
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
