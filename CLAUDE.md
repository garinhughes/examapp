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
    stripe.ts           # Stripe webhook + checkout (RENAMED to gocardless.ts)
    username.ts         # Username management
    skillLabs.ts        # GET/POST /skill-labs — lab definitions + attempt storage
    reports.ts          # POST /reports — issue reporting (paid-only, SES + DynamoDB)
  plugins/
    auth.ts             # JWT verification plugin
    entitlements.ts     # Access control (free vs paid)
  services/
    ses.ts              # SES client + sendIssueReportEmail
    dynamo.ts           # DynamoDB client + helpers
    examStore.ts        # Exam CRUD via DynamoDB/S3
    attemptsStore.ts    # Attempt persistence
    entitlements.ts     # Entitlement checks
    weakestLink.ts      # Adaptive question selection
    profanityFilter.ts  # Username filter
    skillLabAttemptsStore.ts # Skill lab attempt persistence (local JSON / DynamoDB)
    skillLabStore.ts    # Skill lab S3 + DynamoDB store (mirrors examStore.ts)

frontend/src/
  App.tsx               # Thin shell: ExamProvider + BasketProvider wrapping ExamApp
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
    DiagramsView.tsx    # Mermaid architecture diagrams
  exam/
    types.ts            # Shared types (Exam, Question, Choice, Slot, etc.)
    ExamContext.tsx      # Central state: ~160 context props, all useState/useEffect/handlers
    ExamApp.tsx          # Layout shell: Sidebar, header, route switch, ExamHeader, results
    ExamSetup.tsx        # Pre-start form: mode, domains, filters, sliders, start/resume
    ExamReview.tsx       # Post-exam review: domain filter, question-by-question review
    QuestionNav.tsx      # Question grid, progress bar, Prev/Next, Complete Early
    QuestionCard.tsx     # Single question: matching/ordering/single-multi choice rendering
    Modals.tsx           # Pause overlay, cancel/submit/complete-early modals, toasts, confetti
    PracticeExams.tsx    # Practice exams page: resume banner + provider cards
    AnalyticsView.tsx    # Analytics: score history chart, stats, domain bars, attempts list
    ScoreHistoryChart.tsx # SVG score history chart component
    SortableOrderItem.tsx # DnD sortable wrapper for ordering questions
    utils.tsx            # Pure helpers: isAnswerCorrect, computeDerivedAttempt, renderChoiceContent
    downloads.ts         # CSV/PDF download functions (parameterized)
  gamification/
    GamificationContext.tsx
    badges.ts
    types.ts
  skill-labs/
    types.ts            # LabDefinition, LabSummary, Inspection types
    SkillLabsPage.tsx   # Lab list page (/skill-labs) with filters, pagination, timed/casual toggle
    SearchableFilter.tsx # Reusable multi-select dropdown with search
    SkillLabRunnerPage.tsx # Lab runner dispatcher — routes to correct component by lab.type
    labs/
      LabHeader.tsx       # Shared header: back link + title card + timer/casual badge
      DiagnoseLabRunner.tsx  # Diagnose lab: React Flow diagram with node inspection
      CliLabRunner.tsx       # CLI lab: simulated AWS CLI terminal (no real commands)
      PolicyFixLabRunner.tsx # Policy fix lab: Monaco Editor for IAM policy repair
  hooks/
    useEntitlements.ts  # Checks user access tier
  basket/
    BasketContext.tsx   # Shopping basket state (localStorage persistence, smart suggestions)
    BasketPage.tsx      # Basket view: item list, suggestion banners, GoCardless checkout
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

# Publish skill-lab definitions to S3/DynamoDB
pnpm publish:skill-labs
pnpm publish:skill-labs:dry   # dry run - no writes
```

---

## Infrastructure

- **ECS Fargate** — backend container; task def at `backend/infra/ecs-task-def.json`
- **S3** — exam JSON storage (`examapp-exams-*`), skill-lab definitions (`examapp-skill-labs-*`), frontend static hosting
- **DynamoDB** — attempts, users, entitlements, exam index (`examapp-exams-index`), skill-lab index (`examapp-skill-labs-index`), skill-lab attempts (`examapp-skill-lab-attempts`)
- **Cognito** — auth (JWT issued by Cognito user pool)
- **CloudFront** — frontend CDN
- **WAF** — IP allowlist managed via `backend/infra/waf-allowlist.sh`
- **GoCardless** - payments via webhook in `backend/src/routes/gocardless.ts` (route prefix `/payments`)
- **SES** — production-approved (out of sandbox). Domain: `certshack.com`. Terraform module at `infra/terraform/modules/ses/main.tf` manages domain identity, DKIM CNAMEs, SES verification TXT, SPF TXT, and WorkMail MX record. Service: `backend/src/services/ses.ts`. Env vars: `SES_FROM_ADDRESS` (default `noreply@certshack.com`), `SES_SUPPORT_ADDRESS` (default `support@certshack.com`).
- **WorkMail** — `support@certshack.com` receives issue reports. MX record points to `inbound-smtp.eu-west-1.amazonaws.com` (eu-west-1), managed in the SES Terraform module. WorkMail itself is configured manually in the AWS console (not Terraform).
- **Report Issue** — paid-only feature (`tier === 'paying'`). Frontend modal: `frontend/src/components/ReportIssueModal.tsx`. Backend route: `POST /reports` in `backend/src/routes/reports.ts`. On submit: sends email via SES (`sendIssueReportEmail`) AND persists to DynamoDB (`putIssueReport`). Content types: `question`, `answer`, `explanation`, `lab`.

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
- **Question rendering** (new types like `matching`/`ordering`): `frontend/src/exam/QuestionCard.tsx` for in-exam rendering, `frontend/src/exam/ExamReview.tsx` for post-exam review
- **Exam state/logic**: `frontend/src/exam/ExamContext.tsx` — central React Context with all state, effects, and handlers
- **Exam UI components**: `frontend/src/exam/` — ExamApp (layout shell), ExamSetup, QuestionNav, QuestionCard, ExamReview, Modals, PracticeExams, AnalyticsView
- **Skill Labs**: `frontend/src/skill-labs/` (pages + types) + `backend/src/routes/skillLabs.ts` + `backend/src/services/skillLabStore.ts` + `backend/src/services/skillLabAttemptsStore.ts` + `backend/data/skill-labs.json` (lab definitions). Supports three lab types: `diagnose` (React Flow diagram), `cli` (simulated AWS CLI terminal), `policy-fix` (Monaco Editor IAM policy repair). The runner page (`SkillLabRunnerPage`) dispatches to the correct component by `lab.type` using `React.lazy` + dynamic imports for code-splitting. Lab runner components live in `frontend/src/skill-labs/labs/` and share a common `LabHeader` component. Publishing mirrors the exam pipeline: `pnpm publish:skill-labs` uploads each lab to S3 and writes a summary index to DynamoDB. `SKILL_LAB_SOURCE=local|s3` toggles data source (same pattern as `EXAM_SOURCE`).
- **Report Issue**: `frontend/src/components/ReportIssueModal.tsx` + `backend/src/routes/reports.ts` + `backend/src/services/ses.ts`. Paid-only (`tier === 'paying'`). SES env vars: `SES_FROM_ADDRESS`, `SES_SUPPORT_ADDRESS`. Terraform: `infra/terraform/modules/ses/`.
- **Basket / Payments**: `frontend/src/basket/` (BasketContext + BasketPage) + `backend/src/routes/gocardless.ts` + `backend/src/catalog.ts`. The basket uses localStorage persistence (`certshack:basket`), smart upsell suggestions (e.g. nudge to subscribe when 2+ exams in basket), and a single GoCardless checkout entry point. Pricing: single exams £5, bundles £9/£12, monthly sub £10, annual sub £96. GoCardless routes are stubbed under `/payments` prefix. The `PricingPage` "Add to Basket" buttons and `PracticeExams` cart icons both feed into the basket context.
