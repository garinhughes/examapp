# Terraform — examapp infrastructure

This folder manages all AWS infrastructure for **examapp** (certshack.com) using Terraform with an S3 + DynamoDB remote backend.

## Prerequisites

- Terraform >= 1.0
- AWS CLI configured with the **certshack** SSO profile
- SSO login before any Terraform command:

```bash
aws sso login --profile certshack
export AWS_PROFILE=certshack
```

## Quick start

```bash
# Authenticate
aws sso login --profile certshack
export AWS_PROFILE=certshack

# Initialise (downloads providers, connects to remote state)
terraform init

# Preview changes
terraform plan

# Apply
terraform apply
```

## Remote state

| Resource | Name |
|---|---|
| S3 bucket | `certshack-terraform-state-809472479011-eu-west-1` |
| DynamoDB lock table | `certshack-terraform-locks` |

Configured in `backend.tf`.

## Module layout

All infrastructure is broken into focused modules under `modules/`.
The root `main.tf` wires them together and passes outputs between modules.

| Module | Path | Description |
|---|---|---|
| **acm** | `modules/acm` | ACM certificates — CloudFront cert (us-east-1) and ALB cert (eu-west-1). Outputs certificate ARNs and domain validation options. |
| **apigw** | `modules/apigw` | API Gateway REST API for the Lambda itemcount endpoint (`/v1/metrics/itemcount`). |
| **cloudfront** | `modules/cloudfront` | CloudFront distribution (OAC, SPA error pages, WAF attachment) and the S3 bucket policy granting OAC read access. |
| **cloudwatch** | `modules/cloudwatch` | EventBridge scheduler (triggers Lambda on a cron), CloudWatch dashboard (templated from `dashboards/`). |
| **dynamodb** | `modules/dynamodb` | All DynamoDB tables via a single `tables` map. Supports hash + optional range keys. |
| **ecr** | `modules/ecr` | ECR repositories + lifecycle policies. |
| **ecs** | `modules/ecs` | ECS Fargate cluster, service, task definition, ALB (HTTP→HTTPS redirect), security groups, log group. |
| **github_actions** | `modules/github_actions` | OIDC provider + IAM role for GitHub Actions CI/CD (ECR push, ECS deploy, S3 sync). |
| **iam** | `modules/iam` | IAM roles and policies — ECS task role, ECS execution role, Lambda itemcount role. |
| **lambda** | `modules/lambda` | Lambda function (DynamoDB ItemCount publisher), function URL, EventBridge permission. |
| **route53** | `modules/route53` | Route 53 DNS — ACM validation CNAME records; apex/www/api alias records (conditional via `create_aliases`). |
| **s3** | `modules/s3` | S3 buckets — frontend SPA (`examapp-frontend-*`) and exam questions (`examapp-exam-questions-*`), with versioning, encryption, and public access blocks. |
| **secretsmanager** | `modules/secretsmanager` | Secrets Manager secret for Cognito client secret + resource policy granting ECS task execution role access. |
| **vpc** | `modules/vpc` | VPC, public/private subnets (2 AZs), IGW, route tables, S3/DynamoDB VPC endpoints. |
| **waf** | `modules/waf` | WAFv2 IP set + Web ACL (toggleable via `enable_waf`). Attached to CloudFront. |

## Key resources

| Resource | Example name | Module |
|---|---|---|
| VPC | `examapp-vpc` | `vpc` |
| IAM roles | `examapp-ecs-task-role`, `examapp-ecs-task-exec-role`, `examapp-itemcount-publisher-role` | `iam` |
| GitHub Actions role | `examapp-github-role` | `github_actions` |
| ECR repository | `examapp-backend` | `ecr` |
| S3 frontend bucket | `examapp-frontend-<acct>` | `s3` |
| S3 exam questions bucket | `examapp-exam-questions-<acct>` | `s3` |
| CloudFront distribution | `examapp frontend` | `cloudfront` |
| ACM certificates | CloudFront (us-east-1), ALB (eu-west-1) | `acm` |
| WAFv2 Web ACL | `examapp-waf-restrict-ip` | `waf` |
| ECS cluster + service | `examapp-cluster`, `examapp-backend-svc` | `ecs` |
| ALB | `examapp-alb` | `ecs` |
| DynamoDB tables | `examapp-users`, `examapp-attempts`, `examapp-sessions`, `examapp-exams-index`, `examapp-entitlements`, `examapp-audit`, `examapp-gamification` | `dynamodb` |
| Lambda | `examapp-dynamodb-itemcount-publisher` | `lambda` |
| API Gateway | `examapp-api` | `apigw` |
| CloudWatch dashboard | `examapp-dashboard` | `cloudwatch` |
| EventBridge rule | `examapp-eb-itemcount-scheduler` | `cloudwatch` |
| Secrets Manager | `examapp-cognito-client-secret` | `secretsmanager` |
| Route 53 records | `certshack.com`, `www.certshack.com`, `api.certshack.com` | `route53` |

## Dependency order (fresh deploy)

Terraform resolves this automatically via module references — you just run `terraform apply` from root. For reference, the logical order is:

1. **vpc** — networking primitives used by ECS and VPC endpoints.
2. **iam** — IAM roles/policies required by ECS, Lambda.
3. **github_actions** — OIDC + deploy role for CI/CD.
4. **ecr** — container registries (push images before ECS deploy).
5. **acm** — TLS certificates (CloudFront cert must be us-east-1).
6. **waf** — IP-based Web ACL (optional, toggle via `enable_waf`).
7. **dynamodb** — application tables.
8. **s3** — frontend and exam-questions buckets.
9. **cloudfront** — CDN distribution + OAC bucket policy (needs S3 + ACM + WAF).
10. **secretsmanager** — Cognito client secret for ECS.
11. **ecs** — Fargate cluster, ALB, service (needs VPC, IAM, ECR, ACM, DynamoDB, S3, secrets).
12. **route53** — DNS validation records + alias records (needs CloudFront + ALB).
13. **lambda** + **cloudwatch** + **apigw** — metrics Lambda, scheduler, API Gateway.

## Architecture connections

- **S3 → CloudFront**: CloudFront serves the SPA from the frontend S3 bucket via OAC (Origin Access Control). WAF Web ACL optionally restricts access by IP.
- **CloudFront → ACM**: CloudFront requires an ACM cert in `us-east-1`; the ALB uses a regional cert in `eu-west-1`.
- **ALB → ECS**: The ALB routes API requests to ECS Fargate target groups. HTTPS termination at ALB.
- **ECS → ECR**: Task definitions reference container images in ECR.
- **ECS → DynamoDB / S3**: The ECS task role grants read/write access to DynamoDB tables and S3 exam-questions bucket.
- **ECS → Secrets Manager**: Cognito client secret injected into the task as a secret environment variable.
- **Lambda → CloudWatch → API Gateway**: EventBridge scheduler triggers the Lambda every 30 min; API Gateway exposes it as an HTTP endpoint for the dashboard.

## Variables

Key variables in `variables.tf`:

| Variable | Default | Description |
|---|---|---|
| `project` | `examapp` | Prefix for all resource names |
| `region` | `eu-west-1` | Primary AWS region |
| `domain` | `certshack.com` | Domain name |
| `enable_waf` | `true` | Toggle WAF Web ACL on CloudFront |
| `github_repo` | — | GitHub org/repo for OIDC trust |

## Files

| File | Purpose |
|---|---|
| `main.tf` | Root module — data sources, locals, all module calls |
| `variables.tf` | Input variables |
| `outputs.tf` | Key outputs (VPC, ECR URLs, CloudFront, ALB, etc.) |
| `provider.tf` | AWS provider config (default `eu-west-1` + `useast1` alias) |
| `backend.tf` | S3 remote backend config |
| `modules/` | All service modules (see table above) |
| `lambdas/` | Lambda source code (zipped at plan time) |
| `dashboards/` | CloudWatch dashboard JSON template |

## Making changes

- Edit the specific module, then `terraform plan` from root to see the full graph.
- **Never rename** resource keys or change hash/range keys without a `terraform state mv` — those force replacement (data loss).
- Use `terraform state mv` to reorganise resources between modules non-destructively.
- Keep `*.tfstate` and `.terraform/` out of Git.

## Post-deploy tasks

1. **Push container images** to ECR and trigger an ECS deployment.
2. **Sync frontend** `dist/` to the S3 frontend bucket, then invalidate CloudFront:
   ```bash
   aws s3 sync dist/ s3://examapp-frontend-<acct>/ --delete
   aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
   ```
3. **Upload exam JSON** to the exam-questions bucket for the backend to serve.