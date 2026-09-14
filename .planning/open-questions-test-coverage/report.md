# Open-questions test coverage

## Verdict

Zero existing coverage for `apps/api/src/open-questions/` before this work. Two DB-free test
files now cover the capture, list, and resolve flow end to end: 24 tests, all passing, plus a
clean `tsc --noEmit`.

- `apps/api/src/open-questions/open-questions.repo.test.ts` — 11 tests
- `apps/api/src/open-questions/open-questions.controller.test.ts` — 13 tests

## What is tested and why

The tests are split the same way sibling modules (`gap/`, `learning-list/`) split them: a
controller test that mocks the repo/resolver layer, and a repo test that drives the real repo
functions against an in-memory stand-in for `getDb()` so ordering, filters, and write effects are
observable rather than asserted as `vi.fn` calls.

### Controller (`open-questions.controller.test.ts`)

- Capture of a probe question and a socratic turn returns 404 when the source item no longer
  exists, without inserting.
- Capture resolves the topic server-side (`resolveProbeQuestionItem` / `resolveSocraticTurnItem`)
  and passes `topicId`/`topicTitle` through — the client cannot spoof the topic or item text; only
  `questionText` comes from the body.
- Capture rejects a blank/whitespace `questionText` with 400 before any resolution or insert.
- List rejects an unknown `status` or a non-positive `limit` with 400, and otherwise returns
  `items` plus `totalCount` for the applied filter (string `limit` is coerced to a number).
- Resolve rejects a status outside `answered`/`dismissed` with 400, maps a repo `null` (missing or
  already resolved) to 404, and otherwise passes the answer text through and returns the row.

### Repo (`open-questions.repo.test.ts`)

- `insertOpenQuestion` creates a row in the `open` state with the caller's source/topic and null
  answer/resolution.
- `listOpenQuestions` returns questions oldest-first (longest-unanswered first), filters by status,
  caps at the requested limit, and serializes timestamps to ISO strings.
- `countOpenQuestions` counts all rows or only the requested status.
- `resolveOpenQuestion` records the answer and a `resolvedAt` timestamp, drops any answer text on a
  dismissal, returns null for an unknown id, and returns null on a second resolve of an already
  resolved question (leaving the first answer intact).

## Business rules discovered while reading the code

- **Double-resolve guard**: `resolveOpenQuestion` returns `null` when the row is missing *or* its
  status is no longer `open`, and its `UPDATE` re-checks `status = "open"` so two concurrent
  resolves cannot both flip the row (`apps/api/src/open-questions/open-questions.repo.ts:82`).
- **Answer vs. dismiss**: `answerText` is stored only for `answered`; a `dismissed` resolution
  forces `answerText` to `null` (`apps/api/src/open-questions/open-questions.repo.ts:98`).
- **Topic is never client-supplied**: the capture route resolves `topicId`/`topicTitle` from the
  source item id in the path (`probe_question` or `socratic_turn`), so a captured question cannot
  carry a spoofed topic/context (`apps/api/src/open-questions/open-questions.controller.ts:31` and
  `apps/api/src/shared/study-item.ts:17`).
- **No dedup on capture**: `insertOpenQuestion` inserts a new row every time. There is no
  same-content dedup rule to test — capturing the same question twice legitimately creates two
  open questions.
- **Oldest-first ordering is a shared contract**: the review list and the `/today` banner both rely
  on `ORDER BY created_at ASC`, matching the `(status, created_at)` index.

## Verification run

- `npx vitest run src/open-questions/open-questions.repo.test.ts src/open-questions/open-questions.controller.test.ts` — 24/24 pass.
- `npx vitest run` (full default sweep) — 48 files / 537 tests pass; the two new files are included
  in the default DB-free sweep (not excluded by `vitest.config.ts`).
- `npx tsc --noEmit` in `apps/api` — no errors.

The repo test's in-memory `getDb()` stand-in interprets drizzle's `eq`/`and`/`asc`/`count` SQL
objects structurally, so the tests exercise the real repo logic without touching Postgres — keeping
them in the fast default pass alongside the other mocked-repo tests.
