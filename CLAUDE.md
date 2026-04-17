# CLAUDE.md — examapp

Full-stack practice exams & labs web app on AWS. Monorepo:

| Folder | Purpose |
|---|---|
| `frontend/` | React 18 + Vite + Tailwind SPA |
| `backend/` | Fastify 4 + TypeScript API (Node ESM) |
| `infra/terraform/` | AWS infra (ECS, DynamoDB, S3, CloudFront, WAF, SES) |

## Avoid Reading (large/low-signal)
- `**/node_modules/`, `**/dist/`, `**/pnpm-lock.yaml`
- `infra/terraform/.terraform/`
- `backend/data/exams/*.json`, `backend/data/exam-guides/*.txt`
- `backend/data/skill-labs/*.json`

## Tech Stack

**Backend** — Node.js ESM, TypeScript 5, Fastify 4, `@fastify/jwt`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/cookie`, AWS SDKs (`dynamodb`, `s3`, `ses`, `cognito-identity-provider`). Entry: `backend/src/index.ts`

**Frontend** — React 18, React Router 7, Vite 5, Tailwind CSS 3, Radix UI, `@dnd-kit`, Monaco Editor, ReactFlow, Recharts, `next-themes`. Entry: `frontend/src/main.tsx`

**Infra** — Terraform: `infra/terraform/`, CI/CD: `.github/workflows/`, ECS task def: `backend/infra/ecs-task-def.json`

## Dev Commands

```bash
cd backend && pnpm dev|build|start
cd frontend && pnpm dev|build
```

## Conventions

- Backend uses ESM (`"type": "module"`). Use `import`/`export`, never `require`.
- No test framework. Validate with `pnpm dev`.
- Package manager: **pnpm** (not npm or yarn).
- Every frontend change must be **mobile responsive**. Check at mobile viewport before marking done.

## AWS Accounts / SSO

| Profile | Account | Services |
|---|---|---|
| `certshack` | `809472479011` | ECS, DynamoDB, S3, CloudFront, WAF, ACM, SES, Route53 |
| `mgmt` | `030461496359` | Cognito (`ExamAppPool`, `eu-west-1_c6WQUP1RX`) |

```bash
aws-sso-login certshack   # prod
aws-sso-login mgmt        # management
```

Always pass `--profile certshack` or `--profile mgmt` to AWS CLI commands.

## ECS Task Definition

GitHub Actions owns the deployed version (`ignore_changes = [task_definition]`). When adding env vars or secrets: update **both** `infra/terraform/modules/ecs/main.tf` **and** `backend/infra/ecs-task-def.json`.

## Session Continuity

If `.claude/checkpoint.md` exists, read it at session start. Overwrite it at session end when asked to "save checkpoint".

## Subdirectory Context

More detail in area-specific files (auto-loaded when working in that folder):
- `backend/CLAUDE.md` — routes, services, schema, Cognito, payments
- `frontend/CLAUDE.md` — component tree, state, skill lab runners, mobile rules
- `infra/terraform/CLAUDE.md` — Terraform ops, modules, DynamoDB tables
- `backend/data/CLAUDE.md` — exam/skill-lab publishing workflow
