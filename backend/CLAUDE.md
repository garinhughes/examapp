# CLAUDE.md — backend

Fastify 4 API. Entry: `src/index.ts` (plugin registration, route mounting).

## Avoid Reading
- `data/exams/*.json`, `data/exam-guides/*.txt`, `data/skill-labs/*.json`

## Routes (`src/routes/`)

| File | Prefix | Purpose |
|---|---|---|
| `exams.ts` | `/exams` | GET exam list + questions |
| `attempts.ts` | `/attempts` | POST/GET exam attempts (DynamoDB) |
| `auth.ts` | `/auth` | Cognito token exchange |
| `admin.ts` | `/admin` | Admin-only routes |
| `certificates.ts` | `/certificates` | Token signing + public verify |
| `analytics.ts` | `/analytics` | Per-user analytics |
| `gamification.ts` | `/gamification` | Badges, leaderboard |
| `pricing.ts` | `/pricing` | Pricing config |
| `username.ts` | `/username` | Display name |
| `stripe.ts` | `/payments` | Stripe Checkout (one-time + subscriptions) |
| `paypal.ts` | `/payments/paypal` | PayPal Orders + Subscriptions |
| `skillLabs.ts` | `/skill-labs` | GET/POST skill lab sessions |
| `reports.ts` | `/reports` | Issue reporting (paid-only) |
| `feedback.ts` | `/feedback` | General feedback email (auth required) |
| `ratings.ts` | `/ratings` | Star ratings for questions/labs |
| `polls.ts` | `/polls` | Active poll + voting |
| `metrics.ts` | `/metrics` | Admin exam/lab analytics + quality flags |
| `images.ts` | `/images` | Homepage carousel slides (S3 presigned) |
| `cron.ts` | `/internal/cron` | EventBridge-triggered jobs (expiry reminders, requires `x-cron-secret` header) |
| `unsubscribe.ts` | `/unsubscribe` | Email opt-out via signed JWT (public) |

## Services (`src/services/`)

| File | Purpose |
|---|---|
| `dynamo.ts` | DynamoDB client + shared helpers |
| `ses.ts` | SES email sends |
| `examStore.ts` | Exam metadata reads |
| `attemptsStore.ts` | Exam attempt reads/writes |
| `entitlements.ts` | Access control (free vs paid) |
| `skillLabStore.ts` | Skill lab definitions |
| `skillLabAttemptsStore.ts` | Skill lab session reads/writes |
| `paypalSessions.ts` | PayPal session store (TTL 24h) |
| `cognitoAdmin.ts` | Cross-account Cognito admin (list/delete users) |
| `interactions.ts` | Ratings + poll votes (DynamoDB `examapp-interactions`) |
| `metricsStore.ts` | Exam/lab aggregate metrics |
| `carouselStore.ts` | Homepage carousel config (S3 `examapp-images-*`) |
| `emailLogs.ts` | Email audit log (`examapp-email-logs`) |
| `emailTemplates.ts` | DynamoDB email template CRUD (`examapp-email-templates`) |
| `erasureService.ts` | GDPR right-to-be-forgotten (wipes all user data) |
| `weakestLink.ts` | Weakest domain calculation |
| `profanityFilter.ts` | Content moderation |

## Plugins (`src/plugins/`)
- `auth.ts` — JWT verification
- `entitlements.ts` — access control (free vs paid)

## Question Schema

Shared fields: `id`, `type`, `services[]`, `skills[]`, `domain`, `question`, `tip`, `explanation`, `difficulty (1–5)`, `docs`, `lastReviewed`

- **`single-choice`** — `format: "text"|"json"|"cli"`, `choices[]` (4 total; correct has `sequence: 1`)
- **`multiple-choice`** — `format`, `selectCount: 2|3`, `choices[]` (correct choices have `sequence`)
- **`matching`** — `slots[]` (label + correctChoiceId), `choices[]` (shared pool). No `format`.
- **`ordering`** — `choices[]` only, every choice has `sequence`. No distractors. No `format`.

`sequence` = correct answer (single/multiple) OR position (ordering). Distractors never carry `sequence`.

Question IDs: `{EXAM-CODE}-{NNNN}` (e.g. `SCS-C03-0042`). Assigned in `../exam-generator/`.

## Scope Guidance

- **Route + service**: `src/routes/<name>.ts` + `src/services/<name>Store.ts`
- **Auth/entitlements**: `src/plugins/` + `src/services/entitlements.ts`
- **Exam data**: `src/examLoader.ts` + `src/services/examStore.ts`
- **Skill Labs**: `src/routes/skillLabs.ts` + `src/services/skillLabStore.ts` + `skillLabAttemptsStore.ts`
- **Payments**: `src/routes/stripe.ts` + `src/routes/paypal.ts` + `src/catalog.ts`
- **Report Issue**: `src/routes/reports.ts` + `src/services/ses.ts` — paid-only (`tier === 'paying'`)
- **GDPR erasure**: `src/services/erasureService.ts` + `src/routes/admin.ts`

## Cognito (cross-account)

Cognito (`eu-west-1_c6WQUP1RX`) is in mgmt account (`030461496359`). Backend assumes role `arn:aws:iam::030461496359:role/examapp-mgmt-cross-account-role` via `COGNITO_ADMIN_ROLE_ARN` env var. Missing/empty → access denied. Trust policy must allow `sts:AssumeRole` from the prod ECS task role.

## ECS Task Definition

When adding env vars/secrets: update **both** `infra/terraform/modules/ecs/main.tf` and `backend/infra/ecs-task-def.json`.

## Key Env Vars

**Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`
**PayPal**: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_API_BASE`, `PAYPAL_PLAN_ID_MONTHLY`, `PAYPAL_PLAN_ID_ANNUAL`, `SESSIONS_TABLE`, `VITE_PAYPAL_CLIENT_ID`
**SES**: `SES_FROM_ADDRESS`, `SES_SUPPORT_ADDRESS`
**Cron**: `EXPIRY_REMINDER_DAYS` (default 7), `CRON_SECRET`
**Images**: `IMAGES_S3_BUCKET` (default `examapp-images-809472479011`)
