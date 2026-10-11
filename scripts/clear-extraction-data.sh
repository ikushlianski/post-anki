#!/usr/bin/env bash
# Clears pasted sources, suggestions, cards and their review history from the local dev DB.
# Subjects, settings and other reference data stay. Only the local Docker container is touched.
set -euo pipefail

CONTAINER="post-anki-dev-db"

docker exec -i "$CONTAINER" psql -U postanki -d postanki_dev -v ON_ERROR_STOP=1 <<'SQL'
begin;
delete from knowledge_bit_variant_attempts;
delete from knowledge_bit_reviews;
delete from knowledge_bit_schedules;
delete from knowledge_bit_question_variants;
delete from knowledge_bits;
delete from knowledge_sources;
commit;
SQL

echo "extraction data cleared (sources, suggestions, cards)"
