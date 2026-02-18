#!/usr/bin/env bash
set -euo pipefail

# Simple idempotent deploy helper for local/manual runs.
# Usage: cd backend && ./infra/deploy-backend.sh

REGION=${AWS_REGION:-eu-west-1}
ACCOUNT=${ACCOUNT_ID:-030461496359}
ECR_REPO=examapp-backend
IMAGE_TAG=${IMAGE_TAG:-latest}
CLUSTER=examapp-cluster
SERVICE=examapp-service
ALB_NAME=examapp-alb
TG_NAME=examapp-tg

# Resolve paths relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TRUST_POLICY_FILE="$SCRIPT_DIR/trust-policy.json"
INLINE_POLICY_FILE="$SCRIPT_DIR/examapp-backend-policy.json"
TASK_DEF_FILE="$SCRIPT_DIR/ecs-task-def.json"
DOCKERFILE="$ROOT_DIR/Dockerfile"


echo "Ensure AWS CLI is configured and you have permissions. Region=$REGION"

echo "1) Create ECR repo (idempotent)"
aws ecr create-repository --repository-name $ECR_REPO --region $REGION >/dev/null 2>&1 || true

# echo "2) Build docker image"
# docker build -t ${ECR_REPO}:${IMAGE_TAG} -f backend/Dockerfile .
# aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com
# docker tag ${ECR_REPO}:${IMAGE_TAG} ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}
# docker push ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}

echo "3) Create ECS execution role if missing"
if ! aws iam get-role --role-name ecsTaskExecutionRole >/dev/null 2>&1; then
  aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
fi

echo "4) Create cluster"
aws ecs create-cluster --cluster-name $CLUSTER --region $REGION >/dev/null 2>&1 || true

echo "5) Security groups and ALB (simple defaults)"
VPC_ID=$(aws ec2 describe-vpcs --region $REGION --query 'Vpcs[0].VpcId' --output text)
SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --region $REGION --query 'Subnets[:2].SubnetId' --output text)
if [ -z "$SUBNETS" ] || [ "$SUBNETS" = "None" ]; then
  echo "No subnets found in VPC $VPC_ID; aborting."
  exit 1
fi

# create SGs
ALB_SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${ALB_NAME}-sg" --region $REGION --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)
if [ -z "$ALB_SG" ] || [ "$ALB_SG" = "None" ]; then
  ALB_SG=$(aws ec2 create-security-group --group-name ${ALB_NAME}-sg --description "ALB SG" --vpc-id $VPC_ID --region $REGION --query 'GroupId' --output text)
  aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $REGION || true
fi

TASK_SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=examapp-task-sg" --region $REGION --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)
if [ -z "$TASK_SG" ] || [ "$TASK_SG" = "None" ]; then
  TASK_SG=$(aws ec2 create-security-group --group-name examapp-task-sg --description "ECS task SG" --vpc-id $VPC_ID --region $REGION --query 'GroupId' --output text)
  aws ec2 authorize-security-group-ingress --group-id $TASK_SG --protocol tcp --port 3000 --region $REGION --source-group $ALB_SG || true
fi

# Ensure CloudWatch Logs group exists for ecs logs
LOG_GROUP="/ecs/examapp"
echo "Ensuring CloudWatch Logs group $LOG_GROUP exists"
if ! aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region $REGION --query 'logGroups[?logGroupName==`"$LOG_GROUP"`].logGroupName' --output text | grep -q "$LOG_GROUP"; then
  aws logs create-log-group --log-group-name "$LOG_GROUP" --region $REGION || true
  # set a reasonable retention (14 days)
  aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 14 --region $REGION || true
fi

echo "6) Create ALB + target group + listener"
ALB_ARN=$(aws elbv2 describe-load-balancers --names $ALB_NAME --region $REGION --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true)
if [ -z "$ALB_ARN" ] || [ "$ALB_ARN" = "None" ]; then
  ALB_ARN=$(aws elbv2 create-load-balancer --name $ALB_NAME --subnets $SUBNETS --security-groups $ALB_SG --region $REGION --query 'LoadBalancers[0].LoadBalancerArn' --output text)
fi

TG_ARN=$(aws elbv2 describe-target-groups --names $TG_NAME --region $REGION --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)
if [ -z "$TG_ARN" ] || [ "$TG_ARN" = "None" ]; then
  TG_ARN=$(aws elbv2 create-target-group --name $TG_NAME --protocol HTTP --port 3000 --vpc-id $VPC_ID --target-type ip --region $REGION --query 'TargetGroups[0].TargetGroupArn' --output text)
fi

LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --region $REGION --query 'Listeners[0].ListenerArn' --output text 2>/dev/null || true)
if [ -z "$LISTENER_ARN" ] || [ "$LISTENER_ARN" = "None" ]; then
  aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=$TG_ARN --region $REGION >/dev/null
fi

echo "7) Ensure backend IAM role exists: examapp-backend-role"
if aws iam get-role --role-name examapp-backend-role >/dev/null 2>&1; then
  echo "examapp-backend-role exists"
else
  echo "Creating examapp-backend-role using $TRUST_POLICY_FILE"
  aws iam create-role --role-name examapp-backend-role --assume-role-policy-document file://"$TRUST_POLICY_FILE"
fi

echo "Attach inline policy from $INLINE_POLICY_FILE"
aws iam put-role-policy --role-name examapp-backend-role --policy-name examapp-backend-policy --policy-document file://"$INLINE_POLICY_FILE"

echo "8) Register task definition"
aws ecs register-task-definition --cli-input-json file://"$TASK_DEF_FILE" --region $REGION

echo "9) Create service"
# Build properly quoted JSON for network-configuration
read -r -a SUBNET_ARR <<< "$SUBNETS"
QUOTED_SUBNETS=""
for s in "${SUBNET_ARR[@]}"; do
  if [ -n "$QUOTED_SUBNETS" ]; then
    QUOTED_SUBNETS+=','
  fi
  QUOTED_SUBNETS+="\"${s}\""
done

NETWORK_CONFIG="awsvpcConfiguration={subnets=[${QUOTED_SUBNETS}],securityGroups=[\"${TASK_SG}\"],assignPublicIp=\"ENABLED\"}"

aws ecs create-service \
  --cluster $CLUSTER \
  --service-name $SERVICE \
  --task-definition examapp-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "$NETWORK_CONFIG" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=examapp-backend,containerPort=3000" \
  --region $REGION || true

if [ $? -ne 0 ]; then
  echo "Service may already exist; attempting update"
  aws ecs update-service \
    --cluster $CLUSTER \
    --service-name $SERVICE \
    --task-definition examapp-task \
    --region $REGION
fi
echo "Deploy script completed. Check AWS console or run 'aws ecs describe-services' to verify."
