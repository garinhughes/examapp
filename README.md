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
