# ---------- variables ----------
variable "project" {
  type    = string
  default = "examapp"
}

variable "repositories" {
  type    = list(string)
  default = ["examapp-backend"]
}

# ---------- repositories ----------
resource "aws_ecr_repository" "repos" {
  for_each             = toset(var.repositories)
  name                 = each.key
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = { Project = var.project }
}

resource "aws_ecr_lifecycle_policy" "repos" {
  for_each   = aws_ecr_repository.repos
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ---------- outputs ----------
output "repository_urls" {
  value = { for k, v in aws_ecr_repository.repos : k => v.repository_url }
}
