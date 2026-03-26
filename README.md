# examapp

Monorepo containing the frontend and backend for the Exam App.

Structure:

- `backend/` - Fastify + TypeScript server (see `backend/README.md`)
- `frontend/` - Vite + React + TypeScript client (see `frontend/README.md`)
- `infra/` - AWS infrastructure managed by Terraform plus various policies, scripts and JSON docs
- `scripts/` - miscellaneous helper scripts


## Stack & Notes

A concise reference for developers: frameworks, runtime, data layers, infra, and recent fixes.

Frontend
- Tech: React + TypeScript, built with Vite. Styling by Tailwind CSS.
- Key patterns: component-based UI in `frontend/src/components`, custom hooks for auth (`AuthContext`, `useAuthFetch`), and a small client-side router/state in `frontend/src/App.tsx`.
- Dev: `pnpm` + `npx vite` for local development.

Backend
- Tech: Node.js + TypeScript using Fastify for HTTP routes.
- Layout: `backend/src/routes` (exams, attempts, admin, analytics), `backend/src/services` (S3/Dynamo adapters, examStore), and small CLI scripts under `backend/scripts`.
- AWS: uses AWS SDK v3 for S3, DynamoDB, KMS; Cognito used for auth flows in `AUTH_MODE=cognito` (dev mode supported).

Data layer & storage
- Canonical exam authoring: JSON files under `backend/data/exams/` (local) and published to a versioned S3 bucket when `EXAM_SOURCE=s3`.
- Runtime index: DynamoDB `examapp-exams-index` maps exam codes to S3 keys + version IDs.
- Skill labs: JSON definitions in `backend/data/skill-labs.json` (local) and published to S3 (`examapp-skill-labs-*`) + DynamoDB index (`examapp-skill-labs-index`) when `SKILL_LAB_SOURCE=s3`. Attempts stored in `examapp-skill-lab-attempts`.
- Attempts & gamification: persisted in DynamoDB (and demo JSON in `backend/data/attempts.json` for local/dev runs).

Infrastructure & deployment notes
- Short-term: static frontend (Vite build) served from S3/CloudFront; backend runs on ECS Fargate (task role `examapp-backend-role`) or locally for dev.
- Security: KMS for encryption, least-privilege IAM policies for S3/Dynamo access.

Dev flows & environment toggles
- `AUTH_MODE`: `dev` or `cognito` - toggles authentication mode for local development vs production.
- `EXAM_SOURCE`: `local` or `s3` - toggle whether the backend loads exams from disk or from S3 (versioned publishing workflow supported).
- `SKILL_LAB_SOURCE`: `local` or `s3` - toggle whether skill-lab definitions load from `backend/data/skill-labs.json` or from S3/DynamoDB.

Quick local run (dev)
```bash
# Backend
cd backend
pnpm install
pnpm run dev

# Frontend
cd frontend
pnpm install
pnpm run dev
```

**Publishing content**
```bash
# Single exam (by code)
pnpm publish:exam -- SCS-C03
pnpm publish:exam -- SCS-C03 --dry-run

# All exams
pnpm publish:exams
pnpm publish:exams:dry

# Single skill lab (by id)
pnpm publish:lab -- aws-cloudfront-403
pnpm publish:lab -- aws-cloudfront-403 --dry-run

# All skill labs
pnpm publish:skill-labs
pnpm publish:skill-labs:dry
```
The -- is required by pnpm/npm to forward arguments past to the underlying command - everything after it is passed verbatim to the script.

**Creating exam content**
Refer to separate `exam-generator` GitHub repository. This features a Python and AI-assisted pipeline for creating, reviewing (manual mini-webapp) and merging.

**GitHub Actions**

- **Workflows:**
	- **Full Deploy** (`full-deploy.yml`) - builds backend and frontend and performs the full deployment (ECS + S3/CloudFront). Triggerable via `workflow_dispatch`.
	- **Frontend Deploy** (`frontend-deploy.yml`) - builds and publishes the frontend to S3 and invalidates CloudFront. Triggers on `frontend/**` changes or manual dispatch.
	- **Backend Deploy** (`backend-deploy.yml`) - builds, pushes the backend Docker image to ECR and updates ECS. Triggers on `backend/**` changes or manual dispatch.

- **Secrets / required repo settings:** ensure the following repo secrets are set:
	- `AWS_GITHUB_ACTIONS_ROLE_ARN` - ARN of the OIDC-assumable role for GitHub Actions
	- `FRONTEND_BUCKET` - S3 bucket name for frontend artifacts
	- `CLOUDFRONT_DISTRIBUTION_ID` - CloudFront distribution id (for invalidation)

- **Manual runs:** use the GitHub CLI to trigger workflows locally, for example:

```bash
gh workflow run full-deploy.yml --ref main
gh workflow run frontend-deploy.yml --ref main
gh workflow run backend-deploy.yml --ref main
```

These workflows use OIDC to assume the configured AWS role; make sure the role and trust policy are in place before running.

**AWS Authentication**

When authentication to AWS is required (for terraform or CLI commands), a helper script is available to sign-in via SSO using the `certshack` profile:
```bash
aws-sso-login certshack
```