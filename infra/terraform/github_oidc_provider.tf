/* Create the GitHub Actions OIDC provider in the certshack account
   This allows GitHub Actions to exchange OIDC tokens for AWS STS credentials.
   Thumbprint is the GitHub OIDC CA thumbprint (SHA1) used by AWS.
*/
resource "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # Standard GitHub Actions OIDC thumbprint
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}
