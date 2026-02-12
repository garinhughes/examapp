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
- `src/routes/exams.ts` — endpoint plugin, loads `data/questions.json`
- `data/questions.json` — lightweight JSON storage for questions
