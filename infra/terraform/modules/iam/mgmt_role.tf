/* Management-account role and Route53 policy (moved from root mgmt_role.tf)
   These resources use the aliased provider aws.mgmt and are created only when
   `var.create_mgmt_role` is true.
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
