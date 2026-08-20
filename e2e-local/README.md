# e2e-local

Reusable browser-driven actions, seeds, and mocks for **this repo's own dev-loop
debugging** — running against whatever you already have up from `npm run dev`
(web on :3002, api on :8030). This is deliberately not e2e/ (the Docker-backed,
dedicated-port Playwright stack this repo's own package.json wires up via
`npm run dev:pw`) and it is not verification-repo (the cross-project,
CI-gated Playwright framework with ticket tags, artifact retention, and a
full orchestrator).

## Why this exists, and where the line is

verification-repo owns:
- anything CI-gated or ticket-tagged (`@TICKET.S<N>`)
- the full four-kind test architecture (actions/seeds/queries/fixtures) with
  locked assertion contracts written during planning
- artifact retention, REPORT.md, vision checks, the `/verify-ticket` pipeline

e2e-local owns:
- one-off or repeatable **browser-driven actions** you want to run from a
  throwaway script while debugging a feature in this repo, with no ticket,
  no locked assertions, no report
- a **local mock OpenRouter server** so trying one of these against a real
  dev server never burns a real LLM call
- nothing here is ever asserted against by a CI gate; there is no `test.ts`
  concept, no PASS/FAIL report, no `@TICKET` tag requirement

If a flow here turns out to be worth locking down as a real regression test,
that's a sign it belongs in verification-repo's
`projects/post-anki/post-anki/` tree instead — port the *action*, not this
folder.

## Layout

Mirrors verification-repo's central-catalog convention, scoped to just the
"actions" and "mocks" pieces (no `tests/`, `seeds/`, `queries/` — this repo
doesn't need a locked-assertion layer for its own dev-loop use):

```
e2e-local/
├── actions/
│   ├── <area>/                  — one folder per domain area (matches this
│   │                              repo's own domain folders: subject,
│   │                              curriculum, probe, ...)
│   │   ├── <flow>.action.ts     — one file, one exported async function
│   │   └── index.ts             — area barrel
│   └── index.ts                 — top-level barrel, re-exports every area
├── lib/                         — ActionFailure, waitForHydration,
│                                   clickOnceHydrated, env.ts — all PORTED
│                                   from verification-repo's lib/, not
│                                   imported, so this folder has zero runtime
│                                   dependency on that sibling repo
├── mock-openrouter/
│   ├── server.ts                — minimal HTTP server mimicking
│   │                               OpenRouter's /chat/completions shape
│   ├── schema-fill.ts            — generically fills whatever JSON-Schema a
│   │                               structured-output call sent, instead of
│   │                               hand-written per-scenario stub content
│   └── responses.ts             — plain-text fallback + override controls
├── tsconfig.json
└── README.md
```

## Conventions (deviations from verification-repo, and why)

- **Error type:** actions throw the local `ActionFailure` from `lib/`, a
  straight port of verification-repo's `lib/actions/action-failure.ts` (same
  shape, same `missingTestId`/`fromMessage` statics). Copied rather than
  imported via `@verify-core/*` — that alias only resolves inside
  verification-repo's own tsconfig, and this folder must keep working even
  if verification-repo isn't checked out.
- **No seeds/queries/fixtures layer.** Nothing here mutates or reads Postgres
  directly — every action either drives the UI or calls this app's own HTTP
  API (the same API a browser session would call), so there's no DB-safety
  surface to replicate (`assertTargetAllowed`, forbidden targets, etc. don't
  apply — the local dev DB is yours, not a shared one).
- **No `@TICKET` tags, no `tests/README.md`, no `captureProof`.** There's no
  ticket and no report to write intent into.
- **Ports:** e2e-local always targets `npm run dev`'s ports (web :3002, api
  :8030 — see `lib/env.ts`), not `e2e/`'s dedicated Docker-backed ports
  (:3120 / :8031). If you need the isolated e2e Docker stack, use
  `npm run dev:pw` and verification-repo instead.

## Running an action

There's no runner/report — these are meant to be called from a throwaway
Playwright script during a debugging session. Example:

```ts
// scratch.ts (not committed — or run with tsx directly)
import { chromium } from '@playwright/test'
import { createSubject } from './e2e-local/actions/subject/create-subject.action'
import { addCurriculumFromSource } from './e2e-local/actions/curriculum/add-curriculum-from-source.action'
import { completeCalibrationQuiz } from './e2e-local/actions/probe/complete-calibration-quiz.action'
import { WEB_BASE_URL } from './e2e-local/lib/env'

const browser = await chromium.launch()
// baseURL is required — every action calls page.goto('/some/path'), a real
// Playwright test's config would set this on the fixture instead.
const context = await browser.newContext({ baseURL: WEB_BASE_URL })
const page = await context.newPage()

const subject = await createSubject({ page, name: 'Turbopuffer' })
const curriculum = await addCurriculumFromSource({
  page,
  subjectId: subject.id,
  name: 'Turbopuffer basics',
  docUrl: 'https://turbopuffer.com/docs',
})
const result = await completeCalibrationQuiz({ page, curriculumId: curriculum.id })

console.log(result)
await browser.close()
```

```bash
npx tsx scratch.ts
```

### completeCalibrationQuiz's real precondition chain

A curriculum created by `addCurriculumFromSource` is NOT immediately eligible
for the calibration quiz — that action only gets it to `status: 'curating'`
(or `awaiting_source_approval`). Verified against the live stack, the actual
pipeline a curriculum passes through before `/curriculum/:id/assess` will
even render the "Take a quick level check" button is:

```
curating / awaiting_source_approval
  → POST /curricula/:id/approve-sources   (status: shaping_structure)
  → (async) structure draft generated      (status: ready)
  → POST /curricula/:id/confirm-structure  (redundant once ready, no-op path)
  → at least one topic PATCHed included:true
  → POST /curricula/:id/confirm            (status: confirmed — REQUIRED,
                                             prepareProbeSession 409s
                                             "not_confirmed" otherwise)
```

None of that chain is wrapped as an e2e-local action yet — it's a real gap,
not an oversight papered over. `completeCalibrationQuiz` assumes it's handed
a curriculum already in `status: 'confirmed'` with at least one included
topic. Driving the full "review sources → shape structure in chat → confirm"
UI flow is genuinely the multi-step, chat-based flow the study-technology
form's own help text describes, and porting it is future work — flag it if
you hit this precondition in a script; for now, fast-forward it directly via
the API in a scratch script (as verified during this session):

```ts
await fetch(`${API_BASE_URL}/curricula/${curriculumId}/approve-sources`, {
  method: 'POST', headers: apiAuthHeaders(), body: JSON.stringify({ override: true }),
})
// … poll GET /curricula/:id until status === 'ready' …
await fetch(`${API_BASE_URL}/topics/${topicId}`, {
  method: 'PATCH', headers: apiAuthHeaders(),
  body: JSON.stringify({ topicId, included: true }),
})
await fetch(`${API_BASE_URL}/curricula/${curriculumId}/confirm`, {
  method: 'POST', headers: apiAuthHeaders(),
})
```

## Running the mock OpenRouter server

```bash
npm run e2e-local:mock-openrouter          # starts on :4998
```

Then point the API at it for the duration of your debugging session by
setting, in `apps/api/.env.local`:

```
OPENROUTER_BASE_URL=http://localhost:4998
```

(restart `npm run dev:api` after changing it — see the app's own
`docs/memories/` for the "env only read at startup" gotcha class). Unset it,
or remove the line, to go back to real OpenRouter calls. This is the same
override mechanism verification-repo's e2e mock already uses — not a second
one; e2e-local's mock server just happens to be a different process (a
different port) you can point that same variable at.

Control surface while it's running:
- `GET /healthz` — liveness
- `POST /_mock/reset` — clear any override/force-error state
- `POST /_mock/set-text` — `{ "text": "..." }` to script the next
  non-structured completion (schema-carrying calls always get a
  schema-filled response regardless of this)
- `POST /_mock/force-error` — make the next call return a 502, to exercise a
  retry/error path

Set `E2E_LOCAL_MOCK_DEBUG_SCHEMA=1` before starting the server to have it
print every structured-output call's `response_format.json_schema.schema` to
stdout — useful when a real agent call fails against the mock and you need
to see the exact shape it demanded (this is how the `tags` nullable-vs-array
bug below was found).

## A real bug this mock caught, and how it was fixed

`schema-fill.ts`'s first pass only emitted `null` for a nullable field when
that field was ALSO optional (`!required.has(key) && isNullable(...)`). This
app's own curriculum-structure schema marks `tags` both **required** (every
key must be present under strict-mode structured output) **and**
**nullable** (`.nullable()`, per project memory
`project_openrouter_websearch_no_structured.md`) — so the filler treated it
as a normal required field and generated `[{}]` (an array containing one
empty object) instead of `null`. Mastra's structured-output validator
rejected that with `Expected string, received object` and the curriculum's
structure-draft generation failed after 3 retries. Fixed by making
"nullable" win over "required" when deciding whether to emit `null` — `null`
always satisfies a nullable field regardless of required-ness, so this is
strictly safer, not just a special case for `tags`.

## Typechecking

```bash
npx tsc --noEmit -p e2e-local/tsconfig.json
```

Not wired into the repo's root `npm run typecheck` (that's workspace-scoped
via `--workspaces --if-present`, and e2e-local isn't an npm workspace on
purpose — it has no build output, no package.json of its own, nothing to
publish). Run it directly when touching this folder.
