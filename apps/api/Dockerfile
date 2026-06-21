# syntax=docker/dockerfile:1
# Multi-stage build for @post-anki/api.
# Built from the REPO ROOT context (not apps/api) because the API imports the
# @post-anki/shared and @post-anki/core workspace packages.
#   docker build -f apps/api/Dockerfile -t <image> .
FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace @post-anki/api --include-workspace-root

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY apps/api ./apps/api
RUN addgroup --system app && adduser --system --ingroup app app \
    && chown -R app:app /app
USER app
EXPOSE 8030
ENV NODE_ENV=production
WORKDIR /app/apps/api
CMD ["node", "--dns-result-order=ipv4first", "--no-network-family-autoselection", "--import", "tsx", "src/server.ts"]
