# Terraform migration scaffold — examapp

This folder contains a minimal Terraform scaffold and a migration checklist to move `examapp` resources into the `certshack` AWS account and manage them with Terraform.

Important: this is a scaffold and NOT ready to apply as-is. Review variables and the backend configuration and create the backend S3 bucket + DynamoDB lock table before running `terraform init`.

**Quick workflow / bootstrap**

1. Prepare the management account and SSO access (see `backend.tf` for region and names).
2. Create an S3 bucket and DynamoDB table for the remote Terraform state (example names are placeholders).
3. Configure your AWS CLI/profile to assume the deploy role into `certshack`.
4. Edit `backend.tf` (or pass `-backend-config`) to point to your state bucket and lock table.
5. Run `terraform init` then `terraform plan` then `terraform apply` for each module in the recommended order below.
6. Migrate runtime artifacts (push ECR images, sync frontend S3 content), then update any resource references and redeploy.

Bootstrap commands (example)

```bash
# Create backend bucket and DynamoDB table (run from an account with permission to bootstrap)
aws s3api create-bucket --bucket tfstate-certshack-production --region eu-west-1 --create-bucket-configuration LocationConstraint=eu-west-1
aws s3api put-bucket-encryption --bucket tfstate-certshack-production --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws dynamodb create-table --table-name tf-lock-certshack --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 --region eu-west-1

# Initialize with backend config (example)
terraform init -backend-config="bucket=tfstate-certshack-production" -backend-config="dynamodb_table=tf-lock-certshack"
```

Files in this folder
- `backend.tf` — Terraform S3 backend config (placeholder values).
- `provider.tf` — AWS provider configuration.
- `variables.tf` — Common variables.
- `modules/` — module skeletons: `vpc`, `ecr`, `s3_cloudfront`, `ecs`, `iam`, `dynamodb`.

**Top-level resources & key names**

The following lists the primary resources managed or expected by the Terraform scaffold and the common names/keys used in the project. Adjust names and prefixes in `variables.tf` before applying.

| Resource Type | Logical name (example) | Location / module | Notes |
|---|---:|---|---|
| Remote state S3 bucket | `tfstate-certshack-production` | `backend.tf` (bootstrap) | Remote state storage for Terraform
| Remote state lock table | `tf-lock-certshack` | `backend.tf` (bootstrap) | DynamoDB table for state locking
| VPC / Networking | `certshack-vpc` | `modules/vpc` | Subnets, IGW, route tables
| IAM roles & policies | `examapp-ecs-task-role`, `examapp-deploy-role` | `modules/iam` | Task role, service role, deploy role json artifacts
| ECR repositories | `examapp-backend`, `examapp-frontend` | `modules/ecr` | Container images pushed here
| S3 buckets (frontend) | `examapp-frontend-<acct>` | `modules/s3_cloudfront` | Host SPA assets (static website)
| S3 buckets (exam files) | `examapp-exam-questions-<acct>` | `modules/s3_cloudfront` | Stores exam JSON/versioned objects
| CloudFront distribution | `examapp-cdn` | `modules/s3_cloudfront` | Fronts the frontend S3 bucket; supports WAF and HTTPS
| WAFv2 Web ACL | `examapp-waf` | `modules/s3_cloudfront` or separate module | Optional; attach to CloudFront
| ACM certificates | `cert-shared` | `modules/s3_cloudfront` / provider region | Issued in `us-east-1` for CloudFront or regional for ALB
| ECS cluster & service | `examapp-cluster`, `examapp-backend-svc` | `modules/ecs` | Backend service using ECR image, behind ALB
| Application Load Balancer | `examapp-alb` | `modules/ecs` | Routes /api requests to ECS tasks
| DynamoDB tables | `examapp-users`, `examapp-sessions`, `examapp-exams-index`, `examapp-entitlements`, `examapp-audit` | `modules/dynamodb` | App runtime tables (pay-per-request recommended)
| Secrets Manager secret | `examapp/cognito-client-secret` | `modules/iam` (or secrets module) | Stores Cognito client secret (optional)
| Route53 records | `api.certshack.com`, `www.certshack.com` | root module | DNS entries for CloudFront and API

> Notes: names above are examples used in this repository. Replace `<acct>` and prefixes via variables before applying.

**Expected deployment order (fresh environment)**

1. Bootstrap remote state: create the S3 backend bucket and DynamoDB lock table (manual, once).
2. `terraform init` in the terraform folder (use `-backend-config` or edit `backend.tf`).
3. `modules/vpc` — create networking primitives used by many resources.
4. `modules/iam` — create service/task roles and policy documents (required before ECS, ECR access).
5. `modules/ecr` — create container registries so images can be pushed.
6. `modules/s3_cloudfront` — create frontend/exam S3 buckets and CloudFront distribution (CloudFront requires ACM cert in us-east-1 for global distribution).
7. `modules/dynamodb` — provision application DynamoDB tables.
8. `modules/ecs` — create ECS cluster, task definitions, services, and ALB. ECS tasks reference ECR images and DynamoDB/S3 perms.
9. Post-deploy: push container images to ECR and sync frontend `dist/` to the frontend S3 bucket; then trigger CloudFront invalidation.

This order minimizes dependency errors (e.g., ECS needs roles, ECR repos, and networks).

**Making modular changes**

- Work inside the specific module you need to change (e.g. `modules/ecs`). Update resources, variables, and outputs there.
- Run `terraform init` (if a new provider or module source is introduced) then `terraform plan` and `terraform apply` from the module directory or from the root depending on how you manage state.
- Prefer applying changes at the module level when possible for smaller, isolated changes. For cross-module changes, plan/apply from the root to capture the full graph.
- When updating shared names/identifiers (bucket names, ARNs, dns records), be cautious: renaming resources can cause destructive changes. Use `terraform state mv` and/or create new resources and cut over traffic.
- Update `*.tf` and `variables.tf` consistently; keep `*.tfstate` out of Git (this repo ignores `*.tfstate` and `.terraform/`).

**Key connections / architecture notes**

- S3 + CloudFront: CloudFront is configured to serve the SPA from the frontend S3 bucket and can optionally use an origin access identity/ OAC. CloudFront also supports WAF (Web ACL) for IP restrictions or rate limiting.
- CloudFront + ACM: CloudFront needs an ACM cert in `us-east-1` for custom domains; regional endpoints (ALB) use certs in the same region.
- ALB + ECS: The ALB routes API requests to ECS target groups. ECS task definitions receive environment variables and secrets (from Secrets Manager) for runtime configuration.
- ECS + ECR: ECS task definitions refer to images stored in ECR; CI/CD pipelines must build and push images to the ECR repos created by Terraform.
- Backend + DynamoDB / S3: Backend tasks require IAM permissions to read/write DynamoDB tables and S3 objects; these permissions are granted to the ECS task role.
- Secrets Manager: Confidential values (Cognito client secret, DB passwords) should be stored in Secrets Manager and referenced as task secrets (not in plain env vars).

**Testing & rollout**

- Use a non-production environment or a sandbox AWS account to validate plans and apply changes first.
- For frontend changes: build the SPA, sync to the S3 frontend bucket, then issue a CloudFront invalidation.
- For backend/ECS changes: build new container images, push to ECR, update the task definition (or allow ECS to pick the `:latest` tag if you prefer), then perform a controlled deployment.

**State and safety**

- Keep Terraform state in the remote S3 bucket with DynamoDB locking enabled to avoid concurrent modifications.
- Use `plan` and inspect diffs before applying. When changing identity or DNS resources, plan for traffic cutover.

**Files in this folder (summary)**
- `backend.tf` — remote backend configuration (edit for your bucket/table).
- `provider.tf` — provider setup and region aliases.
- `variables.tf` — top-level variables used by modules.
- `modules/*` — module code for VPC, ECR, S3+CloudFront, ECS, IAM, DynamoDB.

If you want, I can also add a simple checklist script for bootstrapping (create backend bucket + lock table, set backend config, init). Let me know if you'd like that.

**Included convenience scripts**

Two helper files have been added to this folder to simplify bootstrapping and CI examples:

- `bootstrap_backend.sh` — small idempotent script that creates the remote S3 backend bucket and DynamoDB lock table. Run with environment overrides, for example:

```bash
# from infra/terraform
TF_STATE_BUCKET=my-bucket TF_LOCK_TABLE=my-lock-table AWS_REGION=eu-west-1 ./bootstrap_backend.sh
```

- `ci/github-actions-deploy.yml` — an example GitHub Actions workflow that demonstrates building and pushing the backend container to ECR, building the frontend, syncing it to S3, and invalidating CloudFront. Copy it to `.github/workflows/deploy.yml` and update the secrets and parameters before use.

These are convenience examples — review and adapt them to your environment and CI security model before using in production.