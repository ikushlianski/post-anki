# syntax=docker/dockerfile:1
# Multi-stage build for @post-anki/web (TanStack Start + Nitro node-server).
# Built from the REPO ROOT context because the web SSR build bundles the
# @post-anki/shared and @post-anki/api workspace packages.
#   docker build -f apps/web/Dockerfile --build-arg API_BASE_URL=<url> -t <image> .
#
# Nitro's node-server output (.output) is fully self-contained (deps bundled into
# .output/server/_libs), so the runtime stage carries no node_modules.

FROM node:22-slim AS build
WORKDIR /app

# Install deps first (cached unless a package.json or the lockfile changes).
# All workspace manifests are needed because `npm ci` resolves the whole graph.
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/bot/package.json ./apps/bot/
RUN npm ci

# Source needed to build the web app: its own source plus the workspace packages
# the SSR bundle pulls in (@post-anki/shared, @post-anki/core, @post-anki/api).
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# Read at runtime by the server-side BFF; declared so the deploy's --build-arg is
# consumed cleanly. Cloud Run also injects it as a runtime env var.
ARG API_BASE_URL
RUN npm run build --workspace @post-anki/web

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/apps/web/.output ./.output

RUN addgroup --system app && adduser --system --ingroup app app \
    && chown -R app:app /app
USER app

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
