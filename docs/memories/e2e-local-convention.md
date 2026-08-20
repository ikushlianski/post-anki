# e2e-local — repo-local dev-loop actions and mock LLM

## 2026-08-21 — why this exists, and the verification-repo split

`e2e-local/` (repo root) holds browser-driven Playwright **actions** for this
repo's own dev-loop debugging, plus a local mock OpenRouter server — separate
from `e2e/` (this repo's Docker-backed, dedicated-port Playwright stack,
`npm run dev:pw`) and from `verification-repo`'s
`projects/post-anki/post-anki/` tree (the cross-project, CI-gated Playwright
framework with ticket tags, locked test.ts assertion contracts, and full
artifact/report retention).

**The line:** anything CI-gated, ticket-tagged (`@TICKET.S<N>`), or backed by
a locked assertion contract belongs in verification-repo. A one-off or
reusable action you want to run from a throwaway script while debugging —
with no ticket, no report, no PASS/FAIL — belongs in `e2e-local/`. If an
`e2e-local` action turns out worth locking down as a regression test, port
the action's logic into verification-repo; `e2e-local` itself never grows a
`tests/`/`seeds`/`queries` layer.

**Convention mirrors verification-repo's central action catalog** (one file
per action, one exported async function, area barrels, top-level barrel —
see `e2e-local/README.md` for the full layout and the documented
deviations: a locally-ported `ActionFailure`/`waitForHydration`/
`clickOnceHydrated` in `e2e-local/lib/` instead of `@verify-core/*` imports,
since that alias only resolves inside verification-repo's own tsconfig).

## Mock OpenRouter server fills whatever JSON-Schema it's asked for

`e2e-local/mock-openrouter/schema-fill.ts` generically fills any
`response_format.json_schema.schema` a Mastra agent call sends, instead of
verification-repo's ~1200 lines of hand-written per-scenario stub plans —
so it never goes stale as this app's own schemas evolve. Wired through the
**existing** `OPENROUTER_BASE_URL` override in `apps/api/src/shared/env.ts`
(read by `apps/api/src/mastra/model.ts:40`) — not a second mechanism.

**Real bug this caught (2026-08-21):** a field that's both `required` (every
key must be present under strict-mode structured output) AND `.nullable()`
— this app's curriculum-structure schema's `modules[].tags` — was being
filled with `[{}]` instead of `null`, because the filler only nulled a
field when it was NOT required. Mastra's structured-output validator
rejected it (`Expected string, received object`), and
`generateDraftStructure` failed after 3 retries, leaving the curriculum
stuck in `status: 'failed'`. Fixed in `schema-fill.ts`: nullable now wins
over required when deciding to emit `null` (see file comment for why this
generalizes, not just a `tags` special-case).

## The real precondition chain before a curriculum can take its calibration quiz

Verified live (not from docs) via `e2e-local/actions/probe/complete-calibration-quiz.action.ts`:
a curriculum created via `addCurriculumFromSource` starts at
`status: 'curating'`/`'awaiting_source_approval'`, and `POST /probe-sessions`
409s `not_confirmed` until ALL of these have happened:
`POST /curricula/:id/approve-sources` → (async) structure draft succeeds →
`status: 'ready'` → at least one topic `PATCH`ed `included: true` →
`POST /curricula/:id/confirm` → `status: 'confirmed'`. The assess page
(`/curriculum/:id/assess`) doesn't even render the "Take a quick level
check" button (`start-level-check` testid) if `includedTopics.length === 0`
— see `apps/web/src/routes/curriculum.$curriculumId_.assess.tsx:103-131`.
None of this chain is wrapped as an e2e-local action yet; see
`e2e-local/README.md`'s "completeCalibrationQuiz's real precondition chain"
section for the exact API calls used to fast-forward it in a scratch script.

## Hydration-race gotcha applies to MORE buttons than the app's existing actions guard

The app already documents (`apps/web`'s own code comments, mirrored in
verification-repo's `wait-for-hydrated-click.ts`) that a plain `.click()`
can land on a server-rendered-but-not-yet-hydrated button and be silently
dropped, for buttons whose route is code-split. This turned out to apply to
**every plain-`onClick` button rendered by a freshly-mounted child
component**, not just route-level buttons: the home page's
`study-technology-toggle`, the assess page's `generate-quiz` (only mounts
once `ProbeSessionQuiz` itself mounts, post level-check-start), and the
quiz's own `quiz-option-N`/`quiz-next` all needed `clickOnceHydrated`, not a
plain click — a plain click there caused the click to silently no-op (no
network request ever fired) rather than erroring, which made it look like a
slow network call instead of a dropped click. `type="submit"` buttons
(`subject-add-button`, `study-technology-submit`) are the opposite case:
their handler is the `<form>`'s `onSubmit`, not an `onClick` prop, so
`clickOnceHydrated`'s React-props poll never resolves for them — use a plain
click there instead, after `waitForHydration`.
