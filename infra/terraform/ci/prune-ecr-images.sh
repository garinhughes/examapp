#!/usr/bin/env bash
set -euo pipefail

# Prune ECR images: keep the most recent N images (default 3)
# Usage: prune-ecr-images.sh <repository-name> [region] [keep]

REPO=${1:-examapp-backend}
REGION=${2:-eu-west-1}
KEEP=${3:-3}

echo "Pruning ECR repository: $REPO in $REGION (keeping $KEEP most recent images)"

if ! command -v aws >/dev/null; then
  echo "aws CLI not found" >&2
  exit 2
fi

images_json=$(aws ecr describe-images --repository-name "$REPO" --region "$REGION" --output json)

to_delete=( $(echo "$images_json" | jq -r --argjson keep "$KEEP" '.imageDetails | sort_by(.imagePushedAt) | reverse | .[$keep:][] | .imageDigest') )

if [ ${#to_delete[@]} -eq 0 ]; then
  echo "No images to delete."
  exit 0
fi

echo "Found ${#to_delete[@]} images to delete"

# Batch delete up to 100 per call
batch=()
for digest in "${to_delete[@]}"; do
  batch+=("imageDigest=$digest")
  if [ ${#batch[@]} -ge 100 ]; then
    aws ecr batch-delete-image --repository-name "$REPO" --region "$REGION" --image-ids ${batch[*]}
    batch=()
  fi
done

if [ ${#batch[@]} -gt 0 ]; then
  aws ecr batch-delete-image --repository-name "$REPO" --region "$REGION" --image-ids ${batch[*]}
fi

echo "Prune complete"
