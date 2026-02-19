#!/usr/bin/env bash
set -euo pipefail

# Small helper to bootstrap Terraform remote state resources.
# Usage:
#   TF_STATE_BUCKET=my-bucket TF_LOCK_TABLE=my-lock-table AWS_REGION=eu-west-1 ./bootstrap_backend.sh

BUCKET=${TF_STATE_BUCKET:-tfstate-certshack-production}
TABLE=${TF_LOCK_TABLE:-tf-lock-certshack}
REGION=${AWS_REGION:-eu-west-1}
PROFILE=${AWS_PROFILE:-}

AWS_CLI=(aws)
if [[ -n "$PROFILE" ]]; then
  AWS_CLI+=(--profile "$PROFILE")
fi

echo "Bootstrapping Terraform remote state resources in ${REGION}"
echo "S3 bucket: ${BUCKET}"
echo "DynamoDB lock table: ${TABLE}"

# Check/create S3 bucket
if ${AWS_CLI[@]} s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  echo "S3 bucket $BUCKET already exists"
else
  echo "Creating S3 bucket $BUCKET in $REGION"
  ${AWS_CLI[@]} s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION"
  echo "Enabling default encryption (AES256)"
  ${AWS_CLI[@]} s3api put-bucket-encryption --bucket "$BUCKET" \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
fi

# Check/create DynamoDB table (simple LockID primary key)
if ${AWS_CLI[@]} dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
  echo "DynamoDB table $TABLE already exists"
else
  echo "Creating DynamoDB table $TABLE"
  ${AWS_CLI[@]} dynamodb create-table \
    --table-name "$TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"
  echo "Waiting for DynamoDB table to become ACTIVE"
  ${AWS_CLI[@]} dynamodb wait table-exists --table-name "$TABLE"
fi

cat <<EOF
Bootstrap complete.
Next steps:
  - Update your local terraform/backend.tf or run terraform init with:
      terraform init -backend-config="bucket=$BUCKET" -backend-config="dynamodb_table=$TABLE"
  - Ensure your CI/CD has credentials to the target AWS account.
EOF
