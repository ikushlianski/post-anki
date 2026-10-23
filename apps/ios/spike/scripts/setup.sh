#!/usr/bin/env bash
# Prepares dev Postgres (post-anki-dev-db) for the PowerSync spike and writes spike/.env.
set -euo pipefail

SPIKE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$SPIKE_DIR/.env"
DB_CONTAINER="${DB_CONTAINER:-post-anki-dev-db}"

if [ ! -f "$ENV_FILE" ]; then
  umask 077
  {
    echo "POWERSYNC_HOST_PORT=5590"
    echo "PS_SOURCE_PASSWORD=$(openssl rand -hex 16)"
    echo "PS_STORAGE_PASSWORD=$(openssl rand -hex 16)"
    echo "PS_DEV_JWT_KEY=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
  } > "$ENV_FILE"
fi

set -a
. "$ENV_FILE"
set +a

docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postanki -d postanki_dev \
  -v "source_pw=$PS_SOURCE_PASSWORD" -v "storage_pw=$PS_STORAGE_PASSWORD" \
  < "$SPIKE_DIR/sql/setup.sql"

echo "Done. Next: docker compose -f $SPIKE_DIR/docker-compose.powersync.yml up -d"
