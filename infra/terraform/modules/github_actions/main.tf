// Module variables declared in variables.tf
# Minimal role for GitHub Actions via OIDC
resource "aws_iam_role" "github_actions" {
  name = "${var.project}-github-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${var.account_id}:oidc-provider/token.actions.githubusercontent.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_org_repo}:*"
          }
        }
      }
    ]
  })

  tags = {
    Project = var.project
    Managed = "terraform"
  }
}

# Minimal inline policy for deploy tasks
data "aws_iam_policy_document" "deploy_policy" {
  statement {
    actions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeRepositories",
      "ecr:GetRepositoryPolicy"
    ]
    resources = ["*"]
  }

  statement {
    actions = ["ecs:UpdateService","ecs:DescribeServices","ecs:DescribeTasks","ecs:ListTasks"]
    resources = ["*"]
  }

  statement {
    actions = ["s3:PutObject","s3:DeleteObject","s3:ListBucket","s3:GetObject"]
    resources = ["arn:aws:s3:::${var.project}-*","arn:aws:s3:::${var.project}-*/*"]
  }

  statement {
    actions = ["cloudfront:CreateInvalidation"]
    resources = ["*"]
  }

  statement {
    actions = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_deploy" {
  name   = "${var.project}-github-deploy-policy"
  policy = data.aws_iam_policy_document.deploy_policy.json
}

resource "aws_iam_role_policy_attachment" "attach_deploy" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_deploy.arn
}

// outputs declared in outputs.tf
