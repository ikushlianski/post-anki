---
type: scenarios
branch: workplace-scenario-packs
task: Port workplace scenario packs to the English subject
state: confirmed
updated: 2026-07-28
---

# Scenarios: Port workplace scenario packs to the English subject

All three scenarios compose existing verification-repo actions only (`openPracticePage`,
`generatePhraseBatch`, `changePack`, `changeLevel`) — no action gaps, no application code changes.
Every scenario creates its own fresh `language-practice` subject via
`setupLanguagePracticeSubject`, so no scenario shares a `language_practice_settings` row with
another (see `spec.md` decision 4).

---

## SCENARIO 1 — A selected pack persists across a page reload

**Narrative:** A learner opens a practice subject (defaults to `General`), switches to the
`StandupUpdates` pack, then reloads the page. The pack picker still shows `StandupUpdates` as
selected — not reset to `General` — because the choice was written to the database, not just
component state.

**Initial data state:** a fresh `language-practice`-kind subject (front door, via the existing
`subject` feature's creation action). No `phrases`/`language_practice_settings` rows beyond what
`getOrCreatePracticeSettings` upserts on first read (defaults to `level: B1_B2, pack: General`).

**Setup role:** the subject is **scenery** (precondition, created via an existing action). The
`language_practice_settings` row this scenario mutates (pack column) is the **subject** under test
— created/mutated front-door via the real `changePack` UI action, never seeded directly.

**UI clicking notes:** `changePack` (existing action) clicks the `pack-select-standup-updates`
button and waits for `aria-pressed="true"` on that button — this already round-trips through the
real `updatePracticeSettings` mutation (the button's `onClick` calls it directly; `aria-pressed`
only flips once the settings collection reflects the write). No modal, no toast — the pressed-state
flip on the button itself is the only success indicator. Reload is a plain `page.reload()`; the
route loader re-fetches settings via `getPracticeSettings` (a plain server-side REST call, not
Electric-only — confirmed in `practice.$subjectId.tsx`), so the reloaded pill state is not racing a
live-sync channel.

**Acceptance:**

Code: None — no application code changes. This scenario exercises the existing
`updatePracticeSettings` mutation, `getOrCreatePracticeSettings` repo function, and the route
loader's `getPracticeSettings` call, all unmodified.

Behavior: Clicking `pack-select-standup-updates` sets `aria-pressed="true"` on that button and
`aria-pressed="false"` (or absent) on every other pack button, before any reload. After
`page.reload()`, the same button (`pack-select-standup-updates`) shows `aria-pressed="true"` again,
sourced from the fresh loader call, not from client-side state surviving the reload (a full
`page.reload()` clears all in-memory React state).

Integration: `language_practice_settings.pack = 'StandupUpdates'` for the test's subject id,
readable via `getRow('language_practice_settings', { subject_id: subjectId })` immediately after
the click and again after the reload (same value both times — proves the DB write, not a UI-only
optimistic flip).

Observability: None new — no logging/metrics change; this plan touches no application code.

Tests:
  [x] @workplace-scenario-packs.S1 — e2e test written

---

## SCENARIO 2 — Selecting a named pack themes the generated batch, provably

**Narrative:** A learner switches to the `CodeReview` pack. The next generated batch is themed —
the sentences on screen are code-review language, not the generic mix — and this is true all the
way down to the database row, not just the button's pressed state.

**Initial data state:** a fresh `language-practice`-kind subject (scenery, front-door creation).
No prior `phrases` rows for this subject.

**Setup role:** the subject is **scenery**. The generated `phrases` rows (10 of them, pack =
`CodeReview`) are the **subject** under test — created front-door by the real
`generatePhraseBatch` flow after switching pack, never seeded.

**UI clicking notes:** `changePack({ page, pack: 'CodeReview' })` (existing action) clicks and
confirms `aria-pressed`. The pack switch itself retriggers `usePracticeBatch`'s reset effect
(keyed on `[level, pack]`), which immediately fires a new `generatePhraseBatch` call — no separate
"Generate" button exists (confirmed in `use-practice-batch.ts` and `open-practice-page.action.ts`'s
own comment: "The ported UI has no manual generate button"). Success indicator: the existing
`generating-batch-message` testid detaches and `phrase-card-0` becomes visible (same wait pattern
`generatePhraseBatch`'s action already implements) — no toast, no modal.

**Themed-content proof mechanism (the non-circular part — see `spec.md`'s "Mock LLM mechanism"):**
`buildPhraseBatchStub` is made pack-aware by parsing the real `Pack: CodeReview` line the app's own
`buildPhraseBatchPrompt` embeds in the prompt — the test asserts against content that is only
reachable if the pack parameter actually traveled from the UI click → `updatePracticeSettings` →
`handleCreatePhraseBatch` → `generatePhraseBatch` → the real prompt → the mock's parse of that
prompt. A test that only asserted "themed content is visible" without this parse-based mock
mechanism would be circular (the theming would come entirely from the test's own stub, proving
nothing about whether the pack reached the model).

**Acceptance:**

Code: `buildPhraseBatchStub(userText: string)` in `verification-repo/projects/post-anki/post-anki/
mock-openrouter/responses.ts` — parses the `Pack: <X>` line from `userText` via a regex (e.g.
`/^Pack: (\w+)$/m`). Input: the full prompt string `buildPhraseBatchPrompt` generates (contains
`Level: <L>\nPack: <P>\n\n...`). Output: `{ phrases: Array<{ russian, referenceEnglish, domain,
targetPhraseBankEntryId: null, newTargetPhrase: null }> }`, 10 items, with `russian`/
`referenceEnglish` text carrying a pack-specific marker (e.g. `"Code review stub, generation
${generation}, item ${index + 1}"` for CodeReview vs. the existing `"Stubbed generation ${generation}
phrase, item ${index + 1}"` for General — unchanged). Edge case: an unparseable or unrecognized pack
value (regex doesn't match, or matches a string outside the 5-value `Pack` enum) throws
synchronously — no wildcard/default branch.

Behavior: After the pack switch and batch generation, `batch-pack-label` reads "Code review" (the
`PACK_LABELS['CodeReview']` display string), sourced from `phrases[0]?.pack`, not from the settings
pointer (already-shipped behavior, exercised not changed). `phrase-russian-0` through
`phrase-russian-9` contain the CodeReview-marker text, not the General-marker text.

Integration: `countWhere('phrases', { subject_id: subjectId, pack: 'CodeReview' })` equals 10
immediately after the batch renders — proves the real INSERT (`insertPhraseBatch`, unmodified) wrote
`pack: 'CodeReview'` for every row of this batch, not just that the UI shows the right label.

Observability: None new.

Tests:
  [x] @workplace-scenario-packs.S2 — e2e test written

---

## SCENARIO 3 — Switching back to General regenerates untainted generic content

**Narrative:** After using a themed pack (`CodeReview`, continuing from S2's flow inline within the
same test — see below), the learner switches back to `General`. The new batch is exactly today's
generic mixed-domain content — no themed residue — and the pack switch doesn't retroactively rewrite
the phrases already generated under `CodeReview`.

**Initial data state:** a fresh `language-practice`-kind subject (scenery). This scenario's test
first drives the pack to `CodeReview` and generates a batch (same flow as S2, inline, not shared
state with S2's own test file/subject) so there is themed history to switch away from, then
switches to `General`.

**Setup role:** the subject is **scenery**. Both the `CodeReview` batch (10 rows) and the
subsequent `General` batch (10 more rows) are **subject** — both front-door, both real
`generatePhraseBatch` flows within the one test.

**UI clicking notes:** same as S2 for the first pack switch/generation. The second switch
(`changePack({ page, pack: 'General' })`) triggers the identical reset-and-regenerate flow. No
special "reset to default" affordance exists or is needed — General is just another pack value.

**Acceptance:**

Code: Same `buildPhraseBatchStub` change as S2 (this scenario exercises the `General` branch, which
is byte-for-byte the pre-existing stub content — see `spec.md`'s "General's stub content is
byte-for-byte unchanged").

Behavior: After the second pack switch and batch generation, `batch-pack-label` reads "General".
`phrase-russian-0` through `-9` contain the pre-existing General-stub marker text (`"Stubbed
generation ${generation} phrase, item ${index + 1}"`), with no CodeReview-marker text anywhere in
the new batch's 10 rows.

Integration: `countWhere('phrases', { subject_id: subjectId, pack: 'General' })` equals 10 for the
new batch. `countWhere('phrases', { subject_id: subjectId, pack: 'CodeReview' })` still equals 10
(the earlier batch's rows, untouched by the pack switch — proves switching packs only affects what
gets generated *next*, never rewrites history).

Observability: None new.

Tests:
  [x] @workplace-scenario-packs.S3 — e2e test written

---

## Open questions

None. Every fork this plan encountered had a codebase-verifiable answer (confirmed by direct read of
`use-practice-batch.ts`, `practice.controller.ts`, `pack-select.tsx`, `batch-practice.tsx`, and
`mock-openrouter/responses.ts`) or used the project's documented recommended-default rule; see
`discussion.md` for the full reasoning trail.
