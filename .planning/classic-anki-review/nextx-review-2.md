# nextx review 2: (A) re-check of the approval-gate feedback fix, (B) "Show today's reviewed cards and subjects"

Severity gate: only Critical/High reported.

## Part A: re-check of the prior High finding (typed feedback vanishing silently)

Verdict: PASS. No Critical/High findings.

Checked and holds
- Failed note save is visible: `saveDecisionNote` now returns a boolean (`apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx`, ~line 173). A failed save, or a missing feedbackId when text was typed, returns false. approve/reject pass `noteFailed` into `decision.show`. `useDecisionFeedback.show` sets the error "Couldn't save the note." (`knowledge-bit-review-decision-feedback.ts`, ~line 99). The decision strip renders it in a `role="alert"` paragraph.
- Approval path: the strip is shown whenever the note failed, even if the card was already graded or has no feedbackId (condition `result?.feedbackId || !noteSaved`).
- Reject prefill works: the typed text goes in as `note`, `show` initialises the strip note box with it, and the strip stays open while the note is unsaved (`noteDirty`). Blur or Ctrl+Enter retries the save, and dismiss or the next decision flushes it.
- Manual-origin cards hide the feedback buttons and box: `feedbackEnabled={bit.origin !== 'manual'}` in `knowledge-bit-review-item.tsx` and `feedbackEnabled={false}` in `knowledge-bit-review-draft-card.tsx`. `knowledge-bit-review-item-actions.tsx` hides both the buttons and the box when it is false.
- Tests: `knowledge-bit-review-panel.feedback.test.tsx` has the rejection failure (message and prefilled text) and the approval failure (message). `knowledge-bit-review-item.test.tsx` has the manual card (no feedback buttons) and the extracted card (buttons shown). `knowledge-bit-review-item-actions.test.tsx` has "no feedback buttons when the card cannot store feedback". `npx vitest run src/knowledge-bit/knowledge-bit-review` in apps/web: 18 files, 202 tests pass.

Non-gating
- The draft card has no test for the hidden feedback buttons. It is hard-coded `false`, and its test file has no feedback assertion.
- For an approval, the typed text is not kept; only the message appears. The reviewer cannot retry from the strip.
- `knowledge-bit-review-panel.tsx` is 474 lines, over the 300 line guideline.

## Part B: "Show today's reviewed cards and subjects"

Verdict: PASS. No Critical/High findings.

Method: I read the repo query and ran the real `getReviewedToday` against a stubbed pg pool to capture the SQL that drizzle emits. No DB was touched, and the temporary probe file was deleted. The integration test was not run, since it needs a Postgres.

Checks
- Local-day window: it reuses the existing `getLocalDayWindow`. That function does `date_trunc('day', now at time zone tz)` and converts back with `at time zone tz`, and takes the end as local midnight plus 1 day computed on the local timestamp. This gives a 23h or 25h day across DST. The rows filter is `reviewed_at >= $1 and reviewed_at < $2`, half-open. With Pacific/Auckland the stub run gave 2026-10-11T11:00Z to 2026-10-12T11:00Z, matching the integration test's expectations (23:50 and 00:10 land on different days).
- Undone reviews are excluded by `undone_at is null`.
- Each card once: `GROUP BY knowledge_bit_id, <subject expression>`. The subject is a pure function of the bit through 1:1 joins, so there is one row per bit. Count, last grade and last prompt come from `count(*)` and `array_agg(... order by reviewed_at desc, id desc)[1]`. The prompt comes from the variant of the latest review. The emitted SQL is valid Postgres (the select and group-by expressions are identical).
- Subject rule matches the dashboard: the expression `case when topic_id is null then source.subject_id else curricula.subject_id end` is character-for-character the one in `subject-review-due-counts.repo.ts`. Null or unknown subject ids go to `unsorted` in the grouping helper, as the dashboard does. There is no subtree roll-up, which suits a card list.
- tz validation: the controller uses `reviewCardsQuerySchema.pick({ tz: true })`, which has an Intl-based refine. Garbage returns 400 `invalid_input` and the repo is not called. The controller test covers this for `Mars/Base`. The web server fn validates with the same schema.
- Injection: every value is a bound parameter (tz x6, the dates, the limit). Nothing is string-interpolated.
- Response size: only `knowledgeBitId`, `prompt`, `reviewCount`, `lastGrade` and `lastReviewedAt`, plus subject id and name and the day bounds. There is no answer text, no variant id and no per-review ids. The SQL limit is 501 and the helper caps at 500 with a `truncated` flag.
- Registrations: `router-table.ts` has GET `/knowledge-bits/reviews/today` (string pattern, before the DELETE regex for `/reviews/:id`, which is a different method). `router.ts` has the name in the union. `api-server.ts` has the switch case and the import. `router.test.ts` asserts the new route, that DELETE `/reviews/r1` still undoes, and that GET `/reviews` is still null. In `packages/shared/src/index.ts` the `knowledge-bit-reviewed-today` export is present. The route tree entry for `/knowledge/reviewed-today` is consistent in `routeTree.gen.ts`. The other hunks in these files belong to other work and were not judged.
- Tests run: API `knowledge-bit-reviewed-today*` (grouping 6, controller 4) plus `router.test.ts` 53 all pass. The web reviewed-today route test, `anki-review-done` and dashboard tests pass (107).

Non-gating
- `getSubjectNamesByIds` uses the default `getDb()` rather than the passed `db`. This is harmless because the integration test sets `DATABASE_URL` to the throwaway DB before importing, but the `db` parameter is only partly honoured.
- The Intl-based tz refine can accept forms that Postgres rejects (for example offset-style zones on newer Node). That would be a 500 rather than a 400. This is the existing shared schema behaviour used by the queue and the due counts, not introduced here.
- When the cap is hit, `totalCards` and `totalReviews` count only the shown 500 cards. The report already states this.
- Reviews whose variant or bit row no longer exists are dropped by the inner joins. The reviewed-today page can then undercount, but superseded variants are kept as intended.
- The web query key omits tz. Harmless because the browser tz is constant per session.

END-OF-REPORT
