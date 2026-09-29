# Todo: tag-assignment provenance

## Decisions to make
Nothing to decide — see plan.md.

## To review / clarify
Nothing to review.

## Coding tasks
- Route curriculum module auto-tagging through assignAutoTag, not assignTag
Not yet populated.

## Manual steps
Run `npm run db:generate` (apps/api) to generate the migration from the schema change, then apply
it via `npm run db:migrate` against the dev/e2e database — never push the schema directly.

## Post-deploy checks
Confirm the migration ran in prod via the existing migrate-on-deploy path before this ships.

## Resolved
None yet.
