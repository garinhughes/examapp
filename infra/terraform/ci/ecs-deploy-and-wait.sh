#!/usr/bin/env bash
set -euo pipefail

# Usage:
# ecs-deploy-and-wait.sh \
#   --cluster my-cluster --service my-service --container-name my-container \
#   --image 123456789012.dkr.ecr.eu-west-1.amazonaws.com/myimage:tag \
#   [--region eu-west-1] [--profile certshack]

ARGS=$(getopt -o '' -l cluster:,service:,container-name:,image:,region:,profile: -n "ecs-deploy-and-wait.sh" -- "$@")
if [ $? -ne 0 ]; then
  echo "Invalid arguments"
  exit 2
fi
eval set -- "$ARGS"

CLUSTER=""; SERVICE=""; CONTAINER=""; IMAGE=""; REGION="eu-west-1"; PROFILE=""
while true; do
  case "$1" in
    --cluster) CLUSTER="$2"; shift 2;;
    --service) SERVICE="$2"; shift 2;;
    --container-name) CONTAINER="$2"; shift 2;;
    --image) IMAGE="$2"; shift 2;;
    --region) REGION="$2"; shift 2;;
    --profile) PROFILE="$2"; shift 2;;
    --) shift; break;;
    *) break;;
  esac
done

if [[ -z "$CLUSTER" || -z "$SERVICE" || -z "$CONTAINER" || -z "$IMAGE" ]]; then
  echo "Missing required args. See usage in file header."
  exit 2
fi

AWS_CLI=(aws --region "$REGION")
if [[ -n "$PROFILE" ]]; then
  AWS_CLI+=(--profile "$PROFILE")
fi

# 1) Get current task definition for service
TD_ARN=$(${AWS_CLI[@]} ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --query 'services[0].taskDefinition' --output text)
if [[ -z "$TD_ARN" || "$TD_ARN" == "None" ]]; then
  echo "Failed to get task definition for $SERVICE in $CLUSTER"
  exit 3
fi

echo "Current task definition: $TD_ARN"

# 2) Fetch task definition JSON
TD_JSON=$(${AWS_CLI[@]} ecs describe-task-definition --task-definition "$TD_ARN" --query 'taskDefinition' --output json)

# 3) Strip unwanted fields and replace image for the specified container
CLEANED=$(
  echo "$TD_JSON" |
  jq 'del(.status, .revision, .compatibilities, .compatibilities, .requiresAttributes, .registeredAt, .registeredBy, .taskDefinitionArn)'
)

UPDATED=$(
  echo "$CLEANED" |
  jq --arg cname "$CONTAINER" --arg img "$IMAGE" '.containerDefinitions |= map(if .name == $cname then .image = $img else . end)'
)

# 4) Register new task definition
NEW_TD_ARN=$(${AWS_CLI[@]} ecs register-task-definition --cli-input-json "$UPDATED" --query 'taskDefinition.taskDefinitionArn' --output text)

if [[ -z "$NEW_TD_ARN" || "$NEW_TD_ARN" == "None" ]]; then
  echo "Failed to register new task definition"
  exit 4
fi

echo "Registered new task definition: $NEW_TD_ARN"

# 5) Update service to use new task def
${AWS_CLI[@]} ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --task-definition "$NEW_TD_ARN"

# 6) Wait for service stability
echo "Waiting for ECS service to become stable..."
${AWS_CLI[@]} ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"

echo "Service is stable."

echo "Done."
