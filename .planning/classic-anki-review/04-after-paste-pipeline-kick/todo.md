---
type: todo
branch: learn-from-doc-site
task: Item 4 — Run bit detection and question generation right after paste
state: open
updated: 2026-10-13
---
# Todo: Item 4 — Run bit detection and question generation right after paste
## Decisions to make
Nothing to decide.
## To review / clarify
Nothing to review.
## Coding tasks
- [x] Write pipeline-kick orchestrator tests: order, isolation, coalescing, guard reset
- [x] Implement pipeline-kick orchestrator with ordered, extendable pass list
- [x] Mock kick module in existing knowledge-source controller test
- [x] Add controller kick tests: success paths kick, failures never kick
- [x] Fire kick after 201 in knowledge-source controller
- [x] Write ingestion-pipeline architecture doc under knowledge-bit domain
## Manual steps
No manual steps required.
## Post-deploy checks
- [ ] Paste on deployed app; confirm suggestions appear within minutes
- [ ] Check logs for run summaries and no unhandled rejections
## Resolved
None yet.
