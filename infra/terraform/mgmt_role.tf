/*
Create an IAM role in the management account that allows the certshack
account (your main account) to assume it. This file should be applied while
authenticated to the management account (e.g. `aws sso login --profile mgmt`).

Usage (one-time):
  AWS_PROFILE=mgmt terraform apply -var='account_id=809472479011' -var='mgmt_profile=mgmt'

After this is applied, note the output `mgmt_role_arn` and then update your
root provider to use `assume_role` for `provider "aws" { alias = "mgmt" }`.
*/

resource "aws_iam_role" "examapp_mgmt_assumable_role" {
  provider = aws.mgmt
  count    = var.create_mgmt_role ? 1 : 0
  name     = "examapp-mgmt-assume-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          AWS = "arn:aws:iam::${var.account_id}:root"
        },
        Action = "sts:AssumeRole",
        Condition = {}
      }
    ]
  })

  tags = { Project = var.project }
}

data "aws_iam_policy_document" "mgmt_route53" {
  provider = aws.mgmt
  count    = var.create_mgmt_role ? 1 : 0
  statement {
    actions = [
      "route53:ListHostedZones",
      "route53:GetHostedZone",
      "route53:ListResourceRecordSets",
      "route53:ChangeResourceRecordSets",
      "route53:GetChange"
    ]
    resources = ["arn:aws:route53:::hostedzone/*", "arn:aws:route53:::change/*"]
  }
}

resource "aws_iam_policy" "mgmt_route53_policy" {
  provider = aws.mgmt
  count    = var.create_mgmt_role ? 1 : 0
  name     = "examapp-mgmt-route53-policy"
  policy   = data.aws_iam_policy_document.mgmt_route53[0].json
}

resource "aws_iam_role_policy_attachment" "attach_route53" {
  provider   = aws.mgmt
  count      = var.create_mgmt_role ? 1 : 0
  role       = aws_iam_role.examapp_mgmt_assumable_role[0].name
  policy_arn = aws_iam_policy.mgmt_route53_policy[0].arn
}

output "mgmt_role_arn" {
  description = "ARN of the role created in the mgmt account which certshack can assume (or value from var.mgmt_role_arn if not created)"
  value       = var.create_mgmt_role ? aws_iam_role.examapp_mgmt_assumable_role[0].arn : var.mgmt_role_arn
}
