---
type: todo
branch: learn-from-doc-site
task: Item 4 — Run bit detection and question generation right after paste
state: open
updated: 2026-10-10
---
# Todo: Item 4 — Run bit detection and question generation right after paste
## Decisions to make
Nothing to decide.
## To review / clarify
Nothing to review.
## Coding tasks
- [ ] Write pipeline-kick orchestrator tests: order, isolation, coalescing, guard reset
- [ ] Implement pipeline-kick orchestrator with ordered, extendable pass list
- [ ] Mock kick module in existing knowledge-source controller test
- [ ] Add controller kick tests: success paths kick, failures never kick
- [ ] Fire kick after 201 in knowledge-source controller
- [ ] Write ingestion-pipeline architecture doc under knowledge-bit domain
## Manual steps
No manual steps required.
## Post-deploy checks
- [ ] Paste on deployed app; confirm suggestions appear within minutes
- [ ] Check logs for run summaries and no unhandled rejections
## Resolved
None yet.
