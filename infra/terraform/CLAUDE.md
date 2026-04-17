# CLAUDE.md — infra/terraform

Manages all AWS infrastructure for examapp (certshack.com). S3 + DynamoDB remote backend.

## Auth (required before any Terraform command)

```bash
aws sso login --profile certshack
export AWS_PROFILE=certshack
```

## Critical Rules

- Always run `terraform plan` before `terraform apply`. Review the full diff.
- **Never run `terraform destroy`** without explicit confirmation from the user.
- **Never rename resource keys or change DynamoDB hash/range keys** without a `terraform state mv` — those force replacement (data loss).
- Terraform state: S3 remote (`backend.tf`). Keep `.terraform/` and `*.tfstate` out of Git.

## ECS Task Definition

`ignore_changes = [task_definition]` applies after first deploy — GitHub Actions owns the running version. When adding env vars or secrets: update **both** `modules/ecs/main.tf` **and** `backend/infra/ecs-task-def.json`.

## Modules

17 modules under `modules/`. See `README.md` for full table with descriptions and dependency order.

| Module | Key resource |
|---|---|
| `acm` | TLS certs (CloudFront us-east-1, ALB eu-west-1) |
| `cloudfront` | CDN + OAC + WAF attachment |
| `ecs` | Fargate cluster, ALB, service, task def |
| `dynamodb` | All DynamoDB tables (map-based) |
| `s3` | Frontend + exam-questions buckets |
| `ses` | SES sending identity + config |
| `vpc` | VPC, subnets, IGW, VPC endpoints |
| `waf` | WAFv2 IP allowlist (toggle: `enable_waf`) |
| `iam` | ECS task role, exec role, Lambda role |
| `github_actions` | OIDC + deploy role for CI/CD |
| `ecr` | Container registries |
| `secretsmanager` | Cognito client secret for ECS |
| `route53` | DNS + ACM validation records |
| `lambda` + `cloudwatch` + `apigw` | Metrics publisher + scheduler + HTTP endpoint |

## DynamoDB Tables (defined in `main.tf`)

`users`, `attempts`, `gamification`, `exams_index`, `entitlements`, `audit`, `sessions`, `skill_labs_index`, `skill_lab_attempts`, `issue_reports`, `metrics`, `interactions`, `email_templates`, `email_logs`
