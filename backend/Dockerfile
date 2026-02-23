# Stage 1 — build
FROM node:18-bullseye AS builder
WORKDIR /app
# Ensure a pnpm v10.x compatible with the lockfile is available
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm run build

# Stage 2 — runtime
FROM node:18-bullseye-slim
WORKDIR /app
ENV NODE_ENV=production
# create non-root user (optional)
RUN addgroup --system app && adduser --system --ingroup app app
# copy only needed artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# expose listen port used by backend (default 3000)
EXPOSE 3000
USER app
CMD ["node", "dist/src/index.js"]