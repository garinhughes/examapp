# examapp-backend (Fastify + TypeScript)

Quickstart (native Ubuntu):

1) Install Node (see below). Install `pnpm` (recommended) or use `npm`:

   # with corepack (Node >=16.10+)
   corepack enable
   corepack prepare pnpm@latest --activate

2) From this folder:

   pnpm install
   pnpm run dev

3) Test endpoints:

   curl http://localhost:3000/exams
   curl http://localhost:3000/exams/aws-saa/questions

Project layout:

- `src/index.ts` — Fastify server entry
- `src/routes/exams.ts` — endpoint plugin, loads per-exam JSON files from `data/exams/`
- `data/exams/` — per-exam JSON files (for example `SCS-C03.json`)

Notes:

- Exam consolidation: multiple smaller exam files have been merged into the single canonical `SCS-C03` exam stored at `data/exams/SCS-C03.json`. The routes continue to support loading different exam files placed in `data/exams/`.
- Schema compliance: question schema now includes `sourceType`, `lastReviewed`, and `originalityScore` to record provenance and an originality metric for generated questions. See `data/schemas/safe_ai_gen_workflow.md` for the generation and review workflow.
