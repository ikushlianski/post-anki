---
type: playwright
branch: workplace-scenario-packs
task: workplace-scenario-packs
state: confirmed
target-project: post-anki
target-feature: features/practice
actions-snapshot-date: 2026-07-28
updated: 2026-07-28
---

# Playwright readiness — Port workplace scenario packs to the English subject

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — A learner's chosen work-scenario theme (standup updates, code review, incident
  postmortems, giving feedback) sticks across sessions, the same way their CEFR level already does
  — they don't have to re-pick it every time they open the practice page. → S1
- B2 — Choosing a themed pack actually changes what the learner practices — not just a UI label —
  so "Code review" mode genuinely drills code-review language, provable at the database level, not
  just visually. → S2
- B3 — Learners can freely move between themed practice and the general mix without either one
  contaminating the other — switching back to General is a clean return, and earlier themed
  sessions stay in history untouched. → S3

**UX scenarios**
- U1 — Clicking a pack pill and reloading the page shows the same pack still selected. → S1
- U2 — Clicking "Code review" regenerates the practice batch and the pack badge next to the
  progress label reads "Code review"; the sentences on screen are code-review sentences. → S2
- U3 — Clicking back to "General" regenerates the batch with the badge reading "General" and
  ordinary mixed-topic sentences, with no leftover code-review content. → S3

**Not e2e (verified at unit/integration only, or intentionally not ported)**
- **Source app's retry-storm-guard fix — not ported at all, application or test layer.**
  `apps/web/src/practice/use-practice-batch.ts` already has a strictly stronger guard than the
  source app's fix, already e2e-proven by `@english-batch-practice.S5`
  (`retry-storm-guard-bounds-failed-generate`), which exercises a real pack switch as part of its
  proof. See `spec.md` decision 2.
- **No new auth/route-protection scenario.** Post-anki's single global `authorized()` gate covers
  every route including the ones this ticket exercises (`updatePracticeSettings`,
  `generateNextBatch`); no per-route middleware exists to forget. See `spec.md` decision 3.
- **No unit test for `buildPhraseBatchStub`'s pack-parsing regex.** It's test infrastructure (the
  mock LLM server), not application code — its correctness is proven by S1-S3 actually passing
  against pack-specific content, not by an isolated unit test of the mock itself.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/practice/` (the existing language-practice feature folder — same one
  `check-my-writing-mode` and the batch-practice/phrase-bank tests already live in)
- Target DB: `post-anki-e2e` (local docker postgres, `localhost:5436`, `e2e/docker-compose.yml`)
- Dev server URL: `http://localhost:3100` (web) / `http://localhost:8031` (api), per `project.json`

## Action surface — snapshot

Actions already available in `features/practice/actions/` at planning time — this plan adds none:

- `openPracticePage({ page, subjectId })` — navigates to `/practice/:subjectId`, waits for
  `level-select-b1-b2` and `pack-select-general` to be visible.
- `generatePhraseBatch({ page, subjectId })` — opens the practice page, waits for
  `generating-batch-message` to detach and `phrase-card-0` to render. Note: this action always
  navigates fresh via `openPracticePage` internally — S2/S3 call `changePack` first, then rely on
  the *reset-and-regenerate* effect that fires automatically on a pack change (no manual "generate"
  trigger exists), so S2/S3 wait on the same `generating-batch-message`/`phrase-card-0` pair
  directly rather than re-calling `generatePhraseBatch` (which would re-navigate and reset scroll/
  state unnecessarily — see each scenario's test for the exact wait sequence).
- `changePack({ page, pack })` — clicks `pack-select-<kebab-pack>`, asserts `aria-pressed="true"`.
- `changeLevel({ page, level })` — not used by this plan's scenarios (level is left at its default,
  `B1_B2`, throughout — pack is the only dimension under test).

**Mock-openrouter change (not an "action" but an equally real planning-time gap):**
`buildPhraseBatchStub` in `mock-openrouter/responses.ts` gains a `userText: string` parameter and
becomes pack-aware — see `spec.md`'s "Mock LLM mechanism" section for the full contract. The
`phrase-batch-generate` responder's `content` callback changes from `() =>
JSON.stringify(buildPhraseBatchStub())` to `(ctx) => JSON.stringify(buildPhraseBatchStub(ctx.userText))`.

## Scenario → action + state + testid map

### S1 — A selected pack persists across a page reload

**Composes actions:** `openPracticePage` (via the existing `subject`-feature's creation flow, then
implicitly through `changePack`'s own navigation-free click), `changePack`.

**Action gaps:** none.

**Pre-test state:** a fresh `language-practice`-kind subject (front door, via the existing
`subject` feature's action).

**Required `data-testid` attributes:** all already exist — `pack-select-standup-updates` (and the
other 4 `pack-select-*` buttons), `level-select-b1-b2`.

**Fixture variants:** none — no LLM call is made in this scenario (only `updatePracticeSettings`,
not `generateNextBatch`, since no batch generation is triggered by a pack change alone until a
render actually asks for one — confirmed: `changePack` alone does not wait for
`generating-batch-message`; only scenarios that read phrase content, S2/S3, need the mock at all).

**Vision check candidate:** no.

---

### S2 — Selecting a named pack themes the generated batch, provably

**Composes actions:** `openPracticePage` (via `generatePhraseBatch`'s internal call for the
initial default-pack batch, establishing baseline state), `changePack`.

**Action gaps:** none.

**Pre-test state:** a fresh `language-practice`-kind subject (front door).

**Required `data-testid` attributes:** all already exist — `batch-pack-label`, `phrase-card-0..9`,
`phrase-russian-0..9`, `generating-batch-message`, `pack-select-code-review`.

**Fixture variants:** `phrase-batch-code-review` — the new `CodeReview` branch inside
`buildPhraseBatchStub` (proposed in `state-fixtures.md`).

**Vision check candidate:** no — text-content assertions (`phrase-russian-N` containing the
CodeReview marker string) plus the DB-layer `countWhere` check are sufficient and less flaky than a
visual check.

---

### S3 — Switching back to General regenerates untainted generic content

**Composes actions:** same as S2 (`openPracticePage` implicitly, `changePack` called twice — once
to `CodeReview`, once back to `General`, within the same test).

**Action gaps:** none.

**Pre-test state:** a fresh `language-practice`-kind subject (front door) — not shared with S2's
subject; this scenario reproduces the CodeReview-then-General sequence inline in its own test so
its `phrases` row count assertions aren't racing S2's own subject.

**Required `data-testid` attributes:** same as S2, plus `pack-select-general`.

**Fixture variants:** `phrase-batch-code-review` (reused from S2) + the unchanged General branch
(no new fixture — it's the pre-existing stub content).

**Vision check candidate:** no.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| (none — all actions this plan needs already exist) | — | — |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S1 | `additive-seed` (subject creation only) + front-door writes | no LLM call; `updatePracticeSettings` only |
| S2 | `additive-seed` (subject creation) + front-door writes | mock-openrouter's `phrase-batch-generate` responder selects the CodeReview branch by parsing `Pack: CodeReview` out of the real prompt — no queue, pure function of the request |
| S3 | `additive-seed` (subject creation) + front-door writes | same mechanism as S2, exercised twice (CodeReview branch, then General branch) within one test |

## Open questions

None carried forward.
