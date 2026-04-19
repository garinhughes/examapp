/**
 * Maps exact technology strings (as used in lab.technologies[]) to their S3 icon keys.
 * Keys are normalised flat paths — no category subdirectory.
 * Icons are served from the examapp-images-* S3 bucket via /images/presigned.
 * Add entries here as new services appear in skill labs.
 */
export const CLOUD_ICON_KEYS: Record<string, string> = {
  // ── AWS ─────────────────────────────────────────────────────────────────────
  'EC2': 'icons/aws/ec2.svg',
  'ECS': 'icons/aws/elastic-container-service.svg',
  'ECR': 'icons/aws/elastic-container-registry.svg',
  'EBS': 'icons/aws/elastic-block-store.svg',
  'EFS': 'icons/aws/efs.svg',
  'ELB': 'icons/aws/elastic-load-balancing.svg',
  'ALB': 'icons/aws/elastic-load-balancing.svg',
  'EMR': 'icons/aws/emr.svg',
  'RDS': 'icons/aws/rds.svg',
  'S3': 'icons/aws/simple-storage-service.svg',
  'SQS': 'icons/aws/simple-queue-service.svg',
  'SNS': 'icons/aws/simple-notification-service.svg',
  // 'STS': no dedicated icon in this set
  'VPC': 'icons/aws/virtual-private-cloud.svg',
  'WAF': 'icons/aws/waf.svg',
  'IAM': 'icons/aws/identity-and-access-management.svg',
  'KMS': 'icons/aws/key-management-service.svg',
  'DAX': 'icons/aws/dynamodb.svg',
  'DNS': 'icons/aws/route-53.svg',

  'Lambda': 'icons/aws/lambda.svg',
  'DynamoDB': 'icons/aws/dynamodb.svg',
  'Aurora': 'icons/aws/aurora.svg',
  'ElastiCache': 'icons/aws/elasticache.svg',
  'CloudWatch': 'icons/aws/cloudwatch.svg',
  'CloudWatch Logs': 'icons/aws/cloudwatch.svg',
  'CloudFront': 'icons/aws/cloudfront.svg',
  'CloudTrail': 'icons/aws/cloudtrail.svg',
  'CloudFormation': 'icons/aws/cloudformation.svg',
  'EventBridge': 'icons/aws/eventbridge.svg',
  'GuardDuty': 'icons/aws/guardduty.svg',
  'Cognito': 'icons/aws/cognito.svg',

  'Route 53': 'icons/aws/route-53.svg',
  'Auto Scaling': 'icons/aws/auto-scaling.svg',
  'Secrets Manager': 'icons/aws/secrets-manager.svg',
  'Systems Manager': 'icons/aws/systems-manager.svg',
  'Directory Service': 'icons/aws/directory-service.svg',

  'CodeBuild': 'icons/aws/codebuild.svg',
  'CodePipeline': 'icons/aws/codepipeline.svg',

  'AWS IAM': 'icons/aws/identity-and-access-management.svg',
  'AWS Lambda': 'icons/aws/lambda.svg',
  'AWS Glue': 'icons/aws/glue.svg',
  'AWS Step Functions': 'icons/aws/step-functions.svg',
  'AWS Lake Formation': 'icons/aws/lake-formation.svg',
  'AWS CodePipeline': 'icons/aws/codepipeline.svg',

  'Amazon Athena': 'icons/aws/athena.svg',
  'Amazon Bedrock': 'icons/aws/sagemaker.svg',  // no dedicated Bedrock icon in this set
  'Amazon DAX': 'icons/aws/dynamodb.svg',
  'Amazon DynamoDB': 'icons/aws/dynamodb.svg',
  'Amazon EMR': 'icons/aws/emr.svg',
  'Amazon MSK': 'icons/aws/managed-streaming-for-apache-kafka.svg',
  'Amazon Redshift': 'icons/aws/redshift.svg',
  'Amazon SageMaker': 'icons/aws/sagemaker.svg',
  'Amazon Textract': 'icons/aws/textract.svg',

  'Bedrock Agents': 'icons/aws/sagemaker.svg',
  'Bedrock Knowledge Bases': 'icons/aws/sagemaker.svg',

  'Kinesis Data Streams': 'icons/aws/kinesis-data-streams.svg',
  'Kinesis Firehose': 'icons/aws/kinesis-firehose.svg',
  'OpenSearch Serverless': 'icons/aws/opensearch-service.svg',
  'Step Functions': 'icons/aws/step-functions.svg',

  'Security Groups': 'icons/aws/waf.svg',
  'Network ACLs': 'icons/aws/virtual-private-cloud.svg',
  'Internet Gateway': 'icons/aws/virtual-private-cloud.svg',
  'NAT Gateway': 'icons/aws/virtual-private-cloud.svg',
  'Target Groups': 'icons/aws/elastic-load-balancing.svg',

  // ── Terraform / general infra ────────────────────────────────────────────────
  // No cloud-specific icon — intentionally omitted (renders as text-only chip)
}
