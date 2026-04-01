# CLAUDE.md — examapp

Full-stack exam/quiz web app on AWS. Monorepo:

| Folder | Purpose |
|---|---|
| `frontend/` | React 18 + Vite + Tailwind SPA |
| `backend/` | Fastify 4 + TypeScript API (Node ESM) |
| `infra/terraform/` | AWS infra (ECS, DynamoDB, S3, CloudWatch, WAF) |

## Avoid Reading (large/low-signal)
- `**/node_modules/`, `**/dist/`, `**/pnpm-lock.yaml`
- `infra/terraform/.terraform/`
- `backend/data/exams/*.json`, `backend/data/exam-guides/*.txt`
- `backend/data/skill-labs/*.json`

## Tech Stack

**Backend** — Node.js ESM, TypeScript 5, Fastify 4, `@fastify/jwt`, `@fastify/cors`, AWS SDKs (`dynamodb`, `s3`, `lib-dynamodb`), Cognito JWT via `jwks-rsa` + `jose`. Entry: `backend/src/index.ts`

**Frontend** — React 18, React Router 7, Vite 5, Tailwind CSS 3, Radix UI, `class-variance-authority`, `lucide-react`, `next-themes`. Entry: `frontend/src/main.tsx` / `App.tsx`

**Infra** — Terraform: `infra/terraform/main.tf`, CI/CD: `.github/workflows/`, ECS task def: `backend/infra/ecs-task-def.json`

## Key Source Files

```
backend/src/
  index.ts              # Server bootstrap, plugin registration, route mounting
  examLoader.ts         # Loads exam JSON from S3 or local data/
  catalog.ts            # Exam catalog/metadata
  routes/
    exams.ts            # GET /exams, GET /exams/:id/questions
    attempts.ts         # POST/GET attempts (DynamoDB)
    auth.ts             # Cognito token exchange
    admin.ts            # Admin-only routes
    certificates.ts     # Certificate token signing + public verify endpoint
    analytics.ts, gamification.ts, pricing.ts, username.ts
    stripe.ts           # Stripe Checkout Sessions — one-time + subscriptions (prefix /payments)
    paypal.ts           # PayPal Orders + Subscriptions (prefix /payments/paypal)
    skillLabs.ts        # GET/POST /skill-labs
    reports.ts          # POST /reports — issue reporting (paid-only)
  plugins/
    auth.ts             # JWT verification
    entitlements.ts     # Access control (free vs paid)
  services/
    dynamo.ts           # DynamoDB client + helpers
    ses.ts              # SES email
    paypalSessions.ts   # PayPal session store (examapp-sessions, TTL 24h)
    examStore.ts, attemptsStore.ts, entitlements.ts
    weakestLink.ts, profanityFilter.ts
    skillLabStore.ts, skillLabAttemptsStore.ts

frontend/src/
  App.tsx               # ExamProvider + BasketProvider wrapping ExamApp
  apiBase.ts
  auth/
    AuthContext.tsx, useAuthFetch.ts, useIsAdmin.ts
  components/
    AdminPanel.tsx, AccountPage.tsx
    CertificateOptions.tsx, CertificatePreview.tsx, CertificatesTab.tsx, VerifyPage.tsx
    CodeBlock.tsx, Leaderboard.tsx, PricingPage.tsx, Sidebar.tsx, DiagramsView.tsx
  exam/
    types.ts            # Shared types (Exam, Question, Choice, Slot, etc.)
    ExamContext.tsx      # Central state: ~160 context props, all useState/useEffect/handlers
    ExamApp.tsx          # Layout shell: Sidebar, header, route switch
    ExamSetup.tsx, ExamReview.tsx, QuestionNav.tsx, QuestionCard.tsx
    Modals.tsx, PracticeExams.tsx, AnalyticsView.tsx, ScoreHistoryChart.tsx
    SortableOrderItem.tsx, utils.tsx, downloads.ts
  gamification/
    GamificationContext.tsx, badges.ts, types.ts
  skill-labs/
    types.ts            # LabDefinition, LabSummary, Inspection types
    SkillLabsPage.tsx, SearchableFilter.tsx, SkillLabRunnerPage.tsx
    labs/
      LabHeader.tsx
      DiagnoseLabRunner.tsx  # React Flow diagram
      CliLabRunner.tsx       # Simulated AWS CLI terminal
      PolicyFixLabRunner.tsx # Monaco Editor IAM policy repair
  hooks/useEntitlements.ts
  basket/
    BasketContext.tsx, BasketPage.tsx
    PayPalCheckout.tsx  # Lazy-loaded into BasketPage
```

## Question Schema

Shared fields (all types): `id`, `type`, `services[]`, `skills[]`, `domain`, `question`, `tip`, `explanation`, `difficulty (1-5)`, `docs`, `lastReviewed`

- **`single-choice`** — `format: "text"|"json"|"cli"`, `choices[]` (4 total, correct has `sequence: 1`)
- **`multiple-choice`** — `format`, `selectCount: 2|3`, `choices[]` (correct choices have `sequence`)
- **`matching`** — `slots[]` (label + correctChoiceId), `choices[]` (shared pool). No `format`.
- **`ordering`** — `choices[]` only, every choice has `sequence`. No distractors. No `format`.

## Dev Commands

```bash
cd backend && pnpm dev|build|start
cd frontend && pnpm dev|build
cd backend && pnpm publish:exams[:dry] | pnpm publish:skill-labs[:dry]
```

## Infrastructure

- **ECS Fargate** — `backend/infra/ecs-task-def.json`
- **S3** — exam JSON (`examapp-exams-*`), skill-labs (`examapp-skill-labs-*`), frontend static
- **DynamoDB** — attempts, users, entitlements, exam index (`examapp-exams-index`), skill-lab index, skill-lab attempts (`examapp-skill-lab-attempts`)
- **Cognito** — JWT auth; user pool in mgmt account (`eu-west-1_c6WQUP1RX`, ExamAppPool)
- **CloudFront** — frontend CDN
- **WAF** — IP allowlist via `backend/infra/waf-allowlist.sh`
- **Stripe** — Card / Apple Pay / Google Pay (one-time + subscriptions), `backend/src/routes/stripe.ts`. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`.
- **PayPal** — Orders + Subscriptions, `backend/src/routes/paypal.ts`. Session store: `examapp-sessions` (TTL 24h). Env: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_API_BASE`, `PAYPAL_PLAN_ID_MONTHLY`, `PAYPAL_PLAN_ID_ANNUAL`, `SESSIONS_TABLE`, `VITE_PAYPAL_CLIENT_ID`
- **SES** — production-approved, domain `certshack.com`. Env: `SES_FROM_ADDRESS`, `SES_SUPPORT_ADDRESS`. Terraform: `infra/terraform/modules/ses/`
- **WorkMail** — `support@certshack.com`, MX → `inbound-smtp.eu-west-1.amazonaws.com` (eu-west-1). Manual setup in AWS console.
- **Report Issue** — paid-only (`tier === 'paying'`). Frontend: `ReportIssueModal.tsx`. Backend: `POST /reports`. Saves to DynamoDB + sends SES email.

Terraform state: S3 remote (`infra/terraform/backend.tf`). Never run `terraform destroy` without confirmation.

### AWS Accounts / SSO Profiles

| Profile | Account | Services |
|---|---|---|
| `certshack` | `809472479011` | ECS, DynamoDB, S3, CloudFront, WAF, ACM, SES, Route53 (`certshack.com`) |
| `mgmt` | `030461496359` | Cognito (`ExamAppPool`, `eu-west-1_c6WQUP1RX`), SES domain identity |

```bash
aws-sso-login certshack   # prod
aws-sso-login mgmt        # management
```

Always pass `--profile certshack` or `--profile mgmt` to AWS CLI commands.

### Cognito is in mgmt account

Cognito (`eu-west-1_c6WQUP1RX`) lives in mgmt (`030461496359`). Backend assumes cross-account role `arn:aws:iam::030461496359:role/examapp-mgmt-cross-account-role` via `COGNITO_ADMIN_ROLE_ARN` env var. Missing/empty var → access denied. The cross-account role's trust policy must allow `sts:AssumeRole` from the prod ECS task role.

### ECS Task Definition: GitHub Actions owns the deployed version

Terraform creates the initial task def but `ignore_changes = [task_definition]` applies after first deploy. Authoritative source: `backend/infra/ecs-task-def.json` (deployed by GitHub Actions).

When adding env vars/secrets: update **both** `infra/terraform/modules/ecs/main.tf` and `backend/infra/ecs-task-def.json`.

## Conventions

- Backend uses ESM (`"type": "module"`). Use `import`/`export`, not `require`.
- No test framework. Validate with `pnpm dev`.
- Question IDs: `{EXAM-CODE}-{NNNN}` (e.g. `SCS-C03-0042`). Assigned at merge time by `../exam-generator/`.
- New questions generated in `../exam-generator/reviews/`, merged into `backend/data/exams/` before publishing.
- `sequence` on a choice = correct answer (single/multiple-choice) OR position (ordering). Distractors never carry `sequence`.

## Scope Guidance

- **Frontend only**: `frontend/src/`
- **Backend route**: `backend/src/routes/` + relevant `backend/src/services/`
- **Auth/entitlements**: `backend/src/plugins/` + `frontend/src/auth/` + `frontend/src/hooks/useEntitlements.ts`
- **Exam data/schema**: `backend/src/examLoader.ts` + `backend/src/services/examStore.ts`
- **Infra**: `infra/terraform/` — confirm before applying
- **Question rendering**: `frontend/src/exam/QuestionCard.tsx` (in-exam), `ExamReview.tsx` (post-exam)
- **Exam state/logic**: `frontend/src/exam/ExamContext.tsx`
- **Exam UI**: `frontend/src/exam/` — ExamApp, ExamSetup, QuestionNav, QuestionCard, ExamReview, Modals, PracticeExams, AnalyticsView
- **Skill Labs**: `frontend/src/skill-labs/` + `backend/src/routes/skillLabs.ts` + `backend/src/services/skillLabStore.ts` + `skillLabAttemptsStore.ts` + `backend/data/skill-labs.json`. Types: `diagnose` (React Flow), `cli` (simulated terminal), `policy-fix` (Monaco Editor). Toggle source: `SKILL_LAB_SOURCE=local|s3`.
- **Report Issue**: `ReportIssueModal.tsx` + `backend/src/routes/reports.ts` + `backend/src/services/ses.ts`. Paid-only.
- **Basket/Payments**: `frontend/src/basket/` + `backend/src/routes/stripe.ts` + `backend/src/routes/paypal.ts` + `backend/src/catalog.ts`. Pricing: exams £9, bundles £17/£25, monthly £10, annual £96.
