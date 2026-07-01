# Scenario: curriculum parse (stubbed architect)

**Front door:** API — `POST /subjects`, then `POST /curricula` with a pasted `text` source.

**What it proves:** The curriculum-architect agent's LLM call is intercepted by the
local mock OpenRouter server (the API runs with `OPENROUTER_BASE_URL` pointed at it),
so no real OpenRouter request is made. The mock returns a deterministic structured
plan, the API persists it, and the curriculum reaches `status: ready`.

**Asserts:**
- DB / API: `GET /curricula/:id` returns `status: ready` with the stub's module titles.
- DB: `modules` rows exist for the curriculum, one per stubbed module.

The expected titles come from `CURRICULUM_STUB_PLAN` in
`e2e/mock-openrouter/responses.ts` — the single source of truth shared by the mock
and this test.
