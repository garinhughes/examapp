# Stage 1 — build
FROM node:25-bookworm AS builder
WORKDIR /app
# In node:25, corepack shims exist but corepack binary is absent; install with --force
RUN npm install -g corepack --force && corepack enable && corepack prepare pnpm@10.30.1 --activate
ENV CI=true
COPY package.json pnpm-lock.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm run build

# Stage 2 — runtime
FROM node:25-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# create non-root user (security best practice)
RUN addgroup --system app && adduser --system --ingroup app app
# copy only needed artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/data ./data
# expose listen port used by backend (default 3000)
EXPOSE 3000
USER app
CMD ["node", "dist/src/index.js"]