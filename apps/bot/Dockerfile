# syntax=docker/dockerfile:1
# Multi-stage build for @post-anki/bot.
# Built from the REPO ROOT context (not apps/bot) because the bot imports the
# @post-anki/shared workspace package.
#   docker build -f apps/bot/Dockerfile -t <image> .
FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/bot/package.json apps/bot/package.json
RUN npm ci --omit=dev --workspace @post-anki/bot --include-workspace-root

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/bot ./apps/bot
RUN addgroup --system app && adduser --system --ingroup app app \
    && chown -R app:app /app
USER app
EXPOSE 8080
ENV NODE_ENV=production
WORKDIR /app/apps/bot
CMD ["npx", "tsx", "src/server.ts"]
