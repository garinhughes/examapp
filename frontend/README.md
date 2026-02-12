# examapp-frontend (Vite + React + TypeScript)

Run locally:

```bash
cd frontend
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
pnpm run dev
```

Open http://localhost:5173

The Vite dev server proxies `/exams` to the backend at http://localhost:3000.
