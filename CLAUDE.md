# CLAUDE.md — examapp

This file gives Claude Code project context to avoid unnecessary file scanning and reduce token usage.

---

## Project Overview

Full-stack exam/quiz web app deployed on AWS. Monorepo with three top-level concerns:

| Folder | Purpose |
|---|---|
| `frontend/` | React 18 + Vite + Tailwind SPA |
| `backend/` | Fastify 4 + TypeScript API (Node ESM) |
| `infra/terraform/` | Terraform managing AWS infra (ECS, DynamoDB, S3, CloudWatch, WAF) |

---

## Do Not Read Unless Relevant

Avoid loading these unless explicitly working on them — they are large and low-signal:

- `**/node_modules/`
- `**/dist/`
- `**/pnpm-lock.yaml`
- `infra/terraform/.terraform/`
- `backend/data/exams/*.json` (large exam data files)
- `backend/data/exam-guides/*.txt`

---

## Tech Stack

**Backend**
- Runtime: Node.js (ESM), TypeScript 5
- Framework: Fastify 4 with `@fastify/jwt`, `@fastify/cors`
- AWS SDKs: `@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/lib-dynamodb`
- Auth: Cognito JWT via `jwks-rsa` + `jose`
- Entry: `backend/src/index.ts`

**Frontend**
- React 18, React Router 7, Vite 5
- Styling: Tailwind CSS 3 + `tailwindcss-animate`
- UI primitives: Radix UI, `class-variance-authority`, `lucide-react`
- Theme: `next-themes`
- Entry: `frontend/src/main.tsx` / `frontend/src/App.tsx`

**Infra**
- Terraform: `infra/terraform/main.tf` (primary), `variables.tf`, `outputs.tf`
- CI/CD: GitHub Actions in `.github/workflows/`
- ECS task definition: `backend/infra/ecs-task-def.json`

---

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
    analytics.ts        # Usage stats
    gamification.ts     # Badges/streaks
    pricing.ts          # Pricing tiers
    stripe.ts           # Stripe webhook + checkout
    username.ts         # Username management
  plugins/
    auth.ts             # JWT verification plugin
    entitlements.ts     # Access control (free vs paid)
  services/
    dynamo.ts           # DynamoDB client + helpers
    examStore.ts        # Exam CRUD via DynamoDB/S3
    attemptsStore.ts    # Attempt persistence
    entitlements.ts     # Entitlement checks
    weakestLink.ts      # Adaptive question selection
    profanityFilter.ts  # Username filter

frontend/src/
  App.tsx               # Route definitions
  apiBase.ts            # Base URL config
  auth/
    AuthContext.tsx     # Cognito auth state
    useAuthFetch.ts     # Authenticated fetch hook
    useIsAdmin.ts       # Admin role check
  components/
    AdminPanel.tsx      # Admin UI
    AccountPage.tsx     # User account/settings
    CodeBlock.tsx       # Syntax-highlighted code display
    Leaderboard.tsx     # Gamification leaderboard
    PricingPage.tsx     # Pricing/paywall UI
    Sidebar.tsx         # Navigation
  gamification/
    GamificationContext.tsx
    badges.ts
    types.ts
  hooks/
    useEntitlements.ts  # Checks user access tier
```

---

## Question Schema (exam JSON)

Exam files live in `backend/data/exams/` (local) and S3 (production). Each file is a JSON array of question objects. All questions share a base set of fields; type-specific fields are noted per type.

**Shared fields (all types)**
```ts
{
  id: string,           // e.g. "SCS-C03-0001"
  type: QuestionType,
  services: string[],
  skills: string[],
  domain: string,
  question: string,
  tip: string,
  explanation: string,
  difficulty: 1 | 2 | 3 | 4 | 5,
  docs: string,         // URL
  lastReviewed: string  // YYYY-MM-DD
}
```

**`single-choice`** — `format: "text"|"json"|"cli"`, `choices[]` (4 total, correct has `sequence: 1`)

**`multiple-choice`** — `format`, `selectCount: 2|3`, `choices[]` (correct choices have `sequence` field)

**`matching`** — `slots[]` (each has `label` + `correctChoiceId`), `choices[]` (shared pool). No `format` field. Order does not matter.

**`ordering`** — `choices[]` only, every choice has `sequence`. No distractors. No `format`. User drags to correct order.

---

## Dev Commands

```bash
# Backend
cd backend
pnpm dev              # ts-node dev server (hot)
pnpm build            # compile to dist/
pnpm start            # run compiled dist/

# Frontend
cd frontend
pnpm dev              # Vite dev server
pnpm build            # production build to dist/

# Publish exam data to DynamoDB/S3
cd backend
pnpm publish:exams
pnpm publish:exams:dry   # dry run - no writes
```

---

## Infrastructure

- **ECS Fargate** — backend container; task def at `backend/infra/ecs-task-def.json`
- **S3** — exam JSON storage + frontend static hosting
- **DynamoDB** — attempts, users, entitlements
- **Cognito** — auth (JWT issued by Cognito user pool)
- **CloudFront** — frontend CDN
- **WAF** — IP allowlist managed via `backend/infra/waf-allowlist.sh`
- **Stripe** — payments via webhook in `backend/src/routes/stripe.ts`

Terraform state is remote (S3 backend defined in `infra/terraform/backend.tf`). Never run `terraform destroy` without explicit confirmation.

---

## Conventions

- Backend uses **ESM** (`"type": "module"`). Use `import`/`export`, not `require`.
- No test framework is currently set up. Validate changes locally with `pnpm dev`.
- Exam question IDs follow the pattern `{EXAM-CODE}-{NNNN}` (e.g. `SCS-C03-0042`). IDs are assigned at merge time by the exam-generator tooling in `../exam-generator/`.
- New question content is generated in `../exam-generator/reviews/` and merged into `backend/data/exams/` before publishing.
- The `sequence` field on a choice marks it as correct (single/multiple-choice) OR defines its position (ordering questions). Distractors never carry `sequence`.

---

## Scope Guidance for Claude

- **Frontend only**: work exclusively under `frontend/src/`
- **Backend route change**: check `backend/src/routes/` + relevant `backend/src/services/`
- **Auth/entitlements change**: `backend/src/plugins/` + `frontend/src/auth/` + `frontend/src/hooks/useEntitlements.ts`
- **Exam data/schema**: `backend/src/examLoader.ts` + `backend/src/services/examStore.ts`
- **Infra change**: `infra/terraform/` — confirm before applying
- **Question rendering** (new types like `matching`/`ordering`): `frontend/src/App.tsx` is the current monolithic view — look there for question rendering logic
