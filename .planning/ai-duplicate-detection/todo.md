---
type: todo
branch: ai-duplicate-detection
task: AI-assisted duplicate detection: surface likely-duplicate subjects (issue #63)
state: open
updated: 2026-07-31
---
# Todo: AI-assisted duplicate detection

## Decisions to make
- Nothing to decide.

## To review / clarify
- [ ] Confirm the existing `OPENROUTER_API_KEY` actually has embeddings access — implementation's first step must make one real call against `POST https://openrouter.ai/api/v1/embeddings` with `openai/text-embedding-3-small` and fail loudly (not silently) if it doesn't, before the rest of the orchestrator is built on top of it (architecture.md's flagged assumptions #1).
- [ ] In that same real call, confirm batched `input: string[]` returns results in strict positional order matching the input (architecture.md's flagged assumption #2) — if not, `embeddings-client.ts` must fall back to one request per subject instead of assuming index N maps to subject N.
- [ ] Check whether OpenRouter enforces a max batch size / aggregate token limit on `/embeddings` that a 200-subject, 2000-char-description batch could hit (architecture.md's flagged assumption #3).

## Manual steps
- No manual steps required — `EMBEDDING_MODEL` gets a default in `env.ts`, no new secret.

## Post-deploy checks
- [ ] After the first deploy, run one real scan against production data and confirm a tracing span appears in Langfuse with subject/embedded/reused/pairs counts (SCENARIO 9) — this confirms the real OpenRouter integration works end-to-end in the deployed environment. Vitest coverage for `subject-duplicate.orchestrator.ts` mocks `global.fetch` directly (standard vitest practice, no new env-var mocking mechanism needed) — the `E2E_MOCK_TRACKED_TOOL_CONTENT`-style override is only relevant if this repo's separate Playwright verification-repo suite later needs to drive a real dev-server scan, which is out of scope for this cut's DoD.
