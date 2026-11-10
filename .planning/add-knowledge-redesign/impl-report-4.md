# impl-report-4: two new extraction models

Diff: `git diff --cached -- packages/shared/src/knowledge-item-model.ts packages/shared/src/knowledge-item-model.test.ts apps/api/src/admin-settings/admin-settings.repo.test.ts docs/architecture/knowledge-bit/extraction-model-switcher.md` (the shared test file may also hold earlier staged changes from other work).

## Changes
- Added deepseek-v4-flash and qwen3.5-flash-02-23 at the end of KNOWLEDGE_ITEM_MODEL_IDS and KNOWLEDGE_ITEM_MODELS (shape and notes as specified). Default stays claude-haiku-5.5; cheapest stays gpt-oss-120b (0.207 vs deepseek 0.24 combined).
- Shared test: count 11 to 13. The id "openrouter/deepseek/deepseek-v4-flash" was used as the "removed/unknown id" fixture in packages/shared and apps/api admin-settings.repo.test.ts; it is now valid, so those fixtures use "openrouter/deepseek/deepseek-v3.2". The expired-gpt-oss cheapest test now expects deepseek-v4-flash (cheaper than mistral).
- Docs table in docs/architecture/knowledge-bit/extraction-model-switcher.md gained both rows.
- Not touched: scripts/*.mjs and .planning docs (benchmark tooling, not allow-lists).

## Wiring
No extra wiring: apps/api/src/mastra/model.ts passes the stored id straight to Mastra as `provider/model` (openrouter prefix preserved). The web select renders from KNOWLEDGE_ITEM_MODEL_OPTIONS, so the new options appear automatically.

## Checks
- tsc --noEmit: apps/web and apps/api clean.
- vitest: apps/web 1416 passed; packages/shared 50 passed; apps/api unit tests (mastra, admin-settings.repo, knowledge-source.controller, detect-knowledge-bits.orchestrator) 230 passed.
- Lint not run (not requested). Staged only; nothing committed.
END-OF-REPORT
