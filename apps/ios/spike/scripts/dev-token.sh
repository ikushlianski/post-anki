#!/usr/bin/env bash
# Prints an HS256 dev JWT (12h) signed with PS_DEV_JWT_KEY from spike/.env.
set -euo pipefail

SPIKE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -a
. "$SPIKE_DIR/.env"
set +a

PORT="${POWERSYNC_HOST_PORT:-5590}"
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

NOW=$(date +%s)
HEADER=$(printf '{"alg":"HS256","typ":"JWT","kid":"dev-key-1"}' | b64url)
PAYLOAD=$(printf '{"sub":"spike-user","aud":"http://localhost:%s","iat":%s,"exp":%s}' "$PORT" "$NOW" "$((NOW + 43200))" | b64url)
KEY_HEX=$(printf '%s' "$PS_DEV_JWT_KEY" | tr '_-' '/+' | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | openssl base64 -d -A | xxd -p -c 256)
SIG=$(printf '%s.%s' "$HEADER" "$PAYLOAD" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$KEY_HEX" -binary | b64url)

printf '%s.%s.%s\n' "$HEADER" "$PAYLOAD" "$SIG"
