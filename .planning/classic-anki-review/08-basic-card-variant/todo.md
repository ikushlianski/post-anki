---
type: todo
branch: learn-from-doc-site
task: F-basic — basic front/back card variant (item 8)
state: open
updated: 2026-10-10
---
# Todo: F-basic — basic front/back card variant
## Decisions to make
Nothing to decide. Every fork took its default, and each default is logged in spec.md under "Decisions made autonomously".
## To review / clarify
- [ ] Before building, check F-kick's and F-queue's real code: the kick orchestrator's pass list, and whether the queue's variant-preference constant already lists "basic". Adjust the edit to match, not the plan's assumption.
- [ ] After rollout, review the approved bits that received unreviewed basic cards (decision D3). If the quality is poor, the fallback is to generate basic cards for pending bits only.
## Coding tasks
- [ ] Steps 1–14 in spec.md "Implementation order"
## Manual steps
- [ ] Generate the migration, then apply it to the local DB only: `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/post_anki_dev npm run db:migrate:api`
- [ ] Paste a real article locally, run the after-paste flow and the scan endpoint, and confirm basic cards appear on the approval page and are served first in Anki review
- [ ] Run the local e2e stack with mock-openrouter and confirm its generic filler produces a stored basic card (no mock change expected)
## Post-deploy checks
- [ ] Confirm the new Cloud Scheduler job exists and its runs return 200
- [ ] Watch LLM call events for `knowledge_bit_basic_card_generation` during the backfill: call count about equal to existing bits, and a low failure rate
## Resolved
None yet.
