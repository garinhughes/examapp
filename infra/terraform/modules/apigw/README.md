Module `apigw` — API Gateway proxy for itemcount publisher

Notes
- This is a Terraform module intended to be invoked from the root `infra/terraform`
  workspace. Do NOT run `terraform init` or `terraform apply` inside this module
  directory — modules inherit the root workspace's backend, providers and
  remote state configuration.

How to use
1. From the repository root (where backend and providers are configured):
   ```bash
   cd infra/terraform
   terraform init
   terraform apply -auto-approve
   ```

2. The module expects the following inputs (already wired by `main.tf`):
   - `project`, `region`, `lambda_arn`, `lambda_function_name`, `stage_name`

3. The module exposes `invoke_url` which is used by the CloudWatch dashboard.

If you accidentally ran `terraform init` inside this module and created a
`.terraform` folder, delete that folder and re-run `terraform init` from the
root `infra/terraform` directory so the remote state/backend is used.
