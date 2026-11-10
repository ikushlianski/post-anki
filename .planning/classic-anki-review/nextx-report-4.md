# nextx report 4: refuse manual items on a processed source

Behaviour: POST /knowledge-sources/:id/items now returns 409 `entry_processed` when the source has `processed_at` set, and writes nothing. The check reads `processed_at` in the same `for update` locked read as the `processing` check.

Changes:
- apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.ts: result union gains `entry_processed`; select adds `processedAt`; refusal before ordinal/insert.
- apps/api/src/knowledge-source/knowledge-source-item.controller.ts: `ERROR_STATUS.entry_processed = 409`.
- knowledge-source-item.controller.test.ts: `entry_processed` row in the it.each (409, body `{ error }`); the repo is mocked, so no insert happens.
- knowledge-bit-manual-item.repo.integration.test.ts: new case "refuse a create on a processed entry and write no rows"; `seedEntry` takes a `processed` flag. WRITTEN, NOT RUN (dev DB off limits).
- .planning/classic-anki-review/source-exhaust-and-manual-items-plan.md: API line now lists 409 `entry_processed`.

No shared Zod/error type exists for these codes (the error strings are literals in the repo union and controller map), so none was added. The web api-client only models `already_running` for regeneration, not this endpoint; untouched.

Checks: vitest knowledge-source-item controller test 11/11 pass (repo test file is integration-only, not run); `npx tsc --noEmit` clean; eslint did not run (config format error in this repo), so lint is unverified.

Staging: nothing staged. All four code files and the plan are untracked (whole-feature new files with foreign content), so `git add` would stage unrelated work. Diff is not available via git for them; changes are the lines listed above.
END-OF-REPORT
