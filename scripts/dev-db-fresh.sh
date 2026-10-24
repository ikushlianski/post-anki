#!/usr/bin/env bash
# Recreates the local dev database from scratch: backup, new volume, all migrations, reference subjects and their nesting.
# Only the local Docker containers of this project are touched; Neon is never used.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUPS="$HOME/.post-anki-backups"
STAMP="$(date +%Y%m%d-%H%M)"

cd "$ROOT"
mkdir -p "$BACKUPS"

docker compose up -d
until [ "$(docker inspect -f '{{.State.Health.Status}}' post-anki-dev-db 2>/dev/null)" = "healthy" ]; do sleep 1; done

docker exec post-anki-dev-db pg_dump -U postanki -d postanki_dev -Fc > "$BACKUPS/postanki_dev-before-fresh-$STAMP.dump"
echo "backup: $BACKUPS/postanki_dev-before-fresh-$STAMP.dump"

docker compose down -v --remove-orphans
docker compose up -d
until [ "$(docker inspect -f '{{.State.Health.Status}}' post-anki-dev-db 2>/dev/null)" = "healthy" ]; do sleep 1; done

npm run db:migrate:api
npm run db:seed:subjects
docker exec -i post-anki-dev-db psql -U postanki -d postanki_dev -v ON_ERROR_STOP=1 < apps/api/src/db/migrations/0089_nest-subjects-under-parents.sql
docker restart post-anki-dev-electric >/dev/null

echo "fresh dev database ready"
