# Todo: all knowledge ingestion on Inngest, then the Business import in prod

## Decisions to make

## To review / clarify

## Coding tasks
- [x] Make prod always run ingestion through Inngest, refuse to boot without the Inngest keys, and fail the deploy loudly when the keys are missing (unit U1 in units.md).
- [x] Stop processing new knowledge inside the API process when Inngest is on, so a failed send leaves the item pending instead (unit U2 in units.md).
- [x] Run the follow-up passes after extraction (embed, tag, cards, dedup, subject assignment) as one debounced Inngest job with a cheap pending-work check (unit U4 in units.md).
- [x] Add a five-minute sweep endpoint that re-queues pending knowledge and only calls Inngest when work exists (unit U3 in units.md).
- [x] Remove the unused DBOS engine so Inngest is the only durable engine (unit U5 in units.md).
- [x] Queue the follow-up passes when an extraction stores items, and run every regeneration through Inngest (unit U6 in units.md).
- [x] Replace the seven knowledge scan scheduler jobs with the single five-minute sweep job in infrastructure code (unit U7 in units.md).
- [x] Stop article summaries and card variants from falling back to in-process work when Inngest rejects a send (unit U8 in units.md).
- [x] Update the docs and local-dev notes so they describe Inngest as the ingestion engine and the free-plan budget (unit U9 in units.md).
- [x] Push to main, watch the deploy turn green, and confirm the prod API answers its health check.
- [x] Sync the prod API with Inngest Cloud so its jobs are registered, then confirm the import and extraction jobs are listed.
- [x] Import all of subjects/Business.txt into prod under the business sub-subjects and confirm every note became raw knowledge with suggested cards.

## Manual steps

## Post-deploy checks

## Resolved
