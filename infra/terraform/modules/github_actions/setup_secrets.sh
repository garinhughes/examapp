#!/usr/bin/env bash
set -euo pipefail

REPO=${1:-garinhughes/examapp}
AWS_PROFILE=${2:-certshack}
TFDIR="infra/terraform"

command -v gh >/dev/null || { echo "gh not installed; install and authenticate (gh auth login)"; exit 1; }
command -v aws >/dev/null || { echo "aws CLI not found"; exit 1; }

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)

# Attempt to read values from terraform outputs
GITHUB_ROLE_ARN=""
CLOUDFRONT_DISTRIBUTION_ID=""
FRONTEND_BUCKET=""
ECS_CLUSTER=""
ECS_SERVICE=""
ECS_CONTAINER_NAME="examapp-backend"

if [ -d "$TFDIR" ]; then
  (cd "$TFDIR"
    # suppress errors if outputs missing
    GITHUB_ROLE_ARN=$(terraform output -raw github_actions_role_arn 2>/dev/null || true)
    CLOUDFRONT_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || true)
    FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name 2>/dev/null || true)
    ECS_CLUSTER_ARN=$(terraform output -raw ecs_cluster_arn 2>/dev/null || true)
    ECS_SERVICE=$(terraform output -raw ecs_backend_service 2>/dev/null || true)
  )
  if [ -n "${ECS_CLUSTER_ARN:-}" ]; then
    ECS_CLUSTER=$(echo "$ECS_CLUSTER_ARN" | awk -F'[:/]' '{print $NF}')
  fi
fi

# Fallback defaults if terraform outputs weren't present
GITHUB_ROLE_ARN=${GITHUB_ROLE_ARN:-"arn:aws:iam::${AWS_ACCOUNT_ID}:role/examapp-github-role"}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-"E3F6OQMGA0XIYD"}
FRONTEND_BUCKET=${FRONTEND_BUCKET:-"examapp-frontend-${AWS_ACCOUNT_ID}"}
ECS_CLUSTER=${ECS_CLUSTER:-"examapp-cluster"}
ECS_SERVICE=${ECS_SERVICE:-"examapp-backend-svc"}

echo "Setting secrets in repository: $REPO"
echo "AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
echo "AWS_GITHUB_ACTIONS_ROLE_ARN=$GITHUB_ROLE_ARN"
echo "ECS_CLUSTER=$ECS_CLUSTER"
echo "ECS_SERVICE=$ECS_SERVICE"
echo "ECS_CONTAINER_NAME=$ECS_CONTAINER_NAME"
echo "FRONTEND_BUCKET=$FRONTEND_BUCKET"
echo "CLOUDFRONT_DISTRIBUTION_ID=$CLOUDFRONT_DISTRIBUTION_ID"

gh secret set AWS_ACCOUNT_ID --body "$AWS_ACCOUNT_ID" --repo "$REPO"
gh secret set AWS_GITHUB_ACTIONS_ROLE_ARN --body "$GITHUB_ROLE_ARN" --repo "$REPO"
gh secret set ECS_CLUSTER --body "$ECS_CLUSTER" --repo "$REPO"
gh secret set ECS_SERVICE --body "$ECS_SERVICE" --repo "$REPO"
gh secret set ECS_CONTAINER_NAME --body "$ECS_CONTAINER_NAME" --repo "$REPO"
gh secret set FRONTEND_BUCKET --body "$FRONTEND_BUCKET" --repo "$REPO"
gh secret set CLOUDFRONT_DISTRIBUTION_ID --body "$CLOUDFRONT_DISTRIBUTION_ID" --repo "$REPO"

echo "Secrets set. Verify with: gh secret list --repo $REPO"