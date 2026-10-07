# Two images from one build:
#   app    — the Next.js web server (standalone bundle, small)
#   worker — the daily snapshot/grading scheduler (needs full node_modules + tsx)
# Build on each host natively (x86_64 ThinkPad, arm64 Oracle Ampere), or use
# `docker buildx build --platform linux/amd64,linux/arm64`.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# npm runs node-gyp for better-sqlite3 on install, which needs a C++ toolchain.
# It only exists in this build stage; the final images don't carry it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TROTTER_DB_PATH=/data/trotter.db \
    TROTTER_MODEL_CACHE=/data/models
# Pre-create the volume mount point owned by the unprivileged user.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
WORKDIR /app

FROM runtime AS app
ENV PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.js"]

FROM runtime AS worker
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
USER node
CMD ["node_modules/.bin/tsx", "scripts/worker.ts"]
