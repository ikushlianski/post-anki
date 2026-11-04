# Review: every chat sends a bounded conversation

VERDICT: PASS on round 2 (personal-reviewer, Sonnet, read-only; review-factory not installed)

Round 1 FAIL (High): web chat clients sent the full history, so a session over 200 messages would have been rejected by the new hard max. Fixed by trimming to the newest 12 messages where the web client builds each chat request; the UI keeps the full history.

Round 2: no Critical or High findings. Card, Q&A, study and global card chat services send the newest 12 messages plus the current message; every transcript schema rejects more than 200 messages. No web path sends a Q&A transcript. A missing transcript is now sent as an empty list, which the API accepts.

Checks: shared 73 tests, API chat services 65 tests, web 44 tests pass; `tsc --noEmit` clean for apps/api, packages/shared, apps/web.

Citation: apps/api/src/qa-chat/qa-chat.service.ts:25
