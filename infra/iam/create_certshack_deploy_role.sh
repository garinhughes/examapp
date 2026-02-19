#!/usr/bin/env bash
set -euo pipefail

# Script to create a scoped deploy role and policy in the certshack account.
# Assumes your AWS CLI is authenticated against the certshack account (809472479011).

ACCOUNT_ID=809472479011
POLICY_NAME=certshack-deploy-policy
ROLE_NAME=certshack-deploy-role
POLICY_FILE="$(dirname "$0")/certshack-deploy-policy.json"
TRUST_FILE="$(dirname "$0")/certshack-deploy-trust.json"

echo "Using AWS CLI default/profile identity:"
aws sts get-caller-identity || true

echo "Creating or locating policy $POLICY_NAME..."
existing=$(aws iam list-policies --scope Local --query "Policies[?PolicyName=='${POLICY_NAME}'].Arn" --output text || true)
if [ -n "$existing" ] && [ "$existing" != "None" ]; then
  POLICY_ARN=$existing
  echo "Found existing policy: $POLICY_ARN"
else
  echo "Creating policy from $POLICY_FILE"
  out=$(aws iam create-policy --policy-name "$POLICY_NAME" --policy-document file://"$POLICY_FILE" 2>&1) || {
    echo "Create-policy failed, attempting to find existing policy: $out"
    POLICY_ARN=$(aws iam list-policies --scope Local --query "Policies[?PolicyName=='${POLICY_NAME}'].Arn" --output text)
  }
  if [ -z "${POLICY_ARN:-}" ]; then
    POLICY_ARN=$(echo "$out" | jq -r '.Policy.Arn')
  fi
  echo "Policy ARN: $POLICY_ARN"
fi

echo "Creating or updating role $ROLE_NAME..."
if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "Role $ROLE_NAME already exists. Updating assume-role policy."
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document file://"$TRUST_FILE"
else
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document file://"$TRUST_FILE"
fi

echo "Attaching policy to role..."
aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn "$POLICY_ARN"

echo "Done. Role created/updated:"
aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text

echo "Example: from the management account you can assume this role with:"
echo "aws sts assume-role --role-arn arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME} --role-session-name deploy-session"

echo "If you need a narrower trust (specific role in the management account), update $TRUST_FILE and re-run this script."
