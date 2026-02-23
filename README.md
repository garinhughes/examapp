# examapp

Monorepo containing the frontend and backend for the Exam App.

Structure:

- `backend/` — Fastify + TypeScript server (see `backend/README.md`)
- `frontend/` — Vite + React + TypeScript client (see `frontend/README.md`)
- `scripts/` — miscellaneous helper scripts

Preparing this repository for GitHub

1. Ensure sensitive files are not committed

- This repo includes a `.gitignore` which ignores `.env` files and runtime data such as `/backend/data/gamification.json`.
- Double-check for any remaining secrets (AWS credentials, PEM keys, `.secrets/`, etc.) before committing.

2. Standard push and remote setup

Run the following from the repository root to create the initial commit and push to your GitHub remote:

```bash
git init
git add .
git commit -m "Initial import"
git remote add origin git@github.com:<your-org-or-username>/examapp.git
git branch -M main
git push -u origin main
```

3. Per-project dev steps

- Backend: see [backend/README.md](backend/README.md) — run `pnpm install` then `pnpm run dev` in `backend/`.
- Frontend: open `frontend/` and follow that README (Vite dev server).

4. Notes

- This repo keeps runtime JSON for some demo data under `backend/data/`. Production deployments should use a real database and secret management.
- If you want me to create a GitHub Actions workflow or add a LICENSE file, tell me which license you prefer and I will add it.

- Exams consolidation: several smaller exam files were consolidated into a single canonical exam file `backend/data/exams/SCS-C03.json`. Deprecated exam files were removed; the application now loads per-exam JSON from `backend/data/exams/`.
- Compliance and provenance: question schema now includes `sourceType`, `lastReviewed`, and `originalityScore` to support the project's safe AI generation workflow. See `backend/data/schemas/safe_ai_gen_workflow.md` for the content-generation policy and requirements.

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
- Attempts & gamification: persisted in DynamoDB (and demo JSON in `backend/data/attempts.json` for local/dev runs).

Infrastructure & deployment notes
- Short-term: static frontend (Vite build) served from S3/CloudFront; backend runs on ECS Fargate (task role `examapp-backend-role`) or locally for dev.
- Security: KMS for encryption, least-privilege IAM policies for S3/Dynamo access.

Dev flows & environment toggles
- `AUTH_MODE`: `dev` or `cognito` — toggles authentication mode for local development vs production.
- `EXAM_SOURCE`: `local` or `s3` — toggle whether the backend loads exams from disk or from S3 (versioned publishing workflow supported).

Recent important fixes (2026-02-18)
- Analytics bug: `backend/src/routes/analytics.ts` — `computeTotals()` incorrectly cast answer `questionId` to Number which produced `NaN` for string IDs; fixed to use string keys so `correctCount` and percentages reflect real answers.
- Complete-early scoring: server `/attempts/:id/finish` now accepts `{ earlyComplete: true }` and persists `earlyComplete`, `answeredCount`, and `totalQuestions`; finishing early correctly scores only answered questions (frontend now sends the flag).
- Admin products: `/admin/products` and `frontend` UI updated so grant dropdown filters unavailable exam products (only exams that exist are shown).

Quick local run (dev)
```bash
# Backend
cd backend
pnpm install
AUTH_MODE=dev pnpm run dev

# Frontend
cd frontend
pnpm install
pnpm run dev
```

If you want I can also add a short ops section (deploy steps, Terraform snippets, CI pipeline) or a minimal runbook for publishing exams to S3.

**GitHub Actions**

- **Workflows:**
	- **Full Deploy** (`full-deploy.yml`) — builds backend and frontend and performs the full deployment (ECS + S3/CloudFront). Triggerable via `workflow_dispatch`.
	- **Frontend Deploy** (`frontend-deploy.yml`) — builds and publishes the frontend to S3 and invalidates CloudFront. Triggers on `frontend/**` changes or manual dispatch.
	- **Backend Deploy** (`backend-deploy.yml`) — builds, pushes the backend Docker image to ECR and updates ECS. Triggers on `backend/**` changes or manual dispatch.

- **Secrets / required repo settings:** ensure the following repo secrets are set:
	- `AWS_GITHUB_ACTIONS_ROLE_ARN` — ARN of the OIDC-assumable role for GitHub Actions
	- `FRONTEND_BUCKET` — S3 bucket name for frontend artifacts
	- `CLOUDFRONT_DISTRIBUTION_ID` — CloudFront distribution id (for invalidation)

- **Manual runs:** use the GitHub CLI to trigger workflows locally, for example:

```bash
gh workflow run full-deploy.yml --ref main
gh workflow run frontend-deploy.yml --ref main
gh workflow run backend-deploy.yml --ref main
```

These workflows use OIDC to assume the configured AWS role; make sure the role and trust policy are in place before running.
