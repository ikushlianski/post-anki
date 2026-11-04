# Per-card schedules for cloze gaps and list steps

Status: plan only, nothing built. Supersedes the "Schedule key" section of `.planning/anki-card-types/plan.md` with a concrete design. Sources read: `.planning/.runs/2026-10-26/{cloze-cards,ordered-list-cards}/report.md`, `.planning/.runs/2026-10-28/ios-cloze/report.md`, and the code listed under "Touchpoints".

## What the user gets

- Each cloze gap and each list step (including "next step" and "overview") is its own card with its own due date, ease, interval, learning step and lapse count.
- After one card of a note is answered, the note's other cards are hidden until the next local day (Anki-style burying). Answering "again" brings that same card back within its learning step; its siblings stay hidden.
- Undo reverts only the card that was graded, and also releases the siblings that grade buried.
- Notes that are not cloze/list (basic, wh, fill-in-the-blank) behave exactly as today: one schedule per note, variants rotate.
- Today's numbers: new/learning/due counts, forecast, statistics and goals now count cards for cloze/list notes. Reviews, points, streak and goals already count one row per review, so they need no change.

## Facts (verified in code)

- F1. Schedule is one row per note: `knowledge_bit_schedules`, primary key `knowledge_bit_id` (`apps/api/src/db/schema.ts:1369`). Columns: ease, interval, due, last reviewed, review count, phase, learning step, lapses, suspended_at, buried_until.
- F2. Variants (`knowledge_bit_question_variants`) hold no scheduling state. Cloze variants are keyed by `(bit, kind='cloze', order=number)`, list cards by `(bit, list_step|list_next|list_overview, order=position)`; one active row per slot (partial unique index on `superseded_at is null`).
- F3. Review log `knowledge_bit_reviews` already stores `variant_id` and a `prev_schedule` JSON snapshot of the note's schedule; it has no card key. Undo ("not latest" check, restore) works per bit.
- F4. The queue is built by `pickedVariants` (`knowledge-bit-review-queue-picked.repo.ts`): `row_number() over (partition by bit ...) = 1`, so exactly one variant per note. Every count (home, subject due counts, plan-day counts, queue totals, new-card allowance) is derived from that one set with `pickRank = 1` and `scheduleBitId is null` meaning new.
- F5. The pure scheduler (`knowledge-bit-grade-schedule.ts`, `knowledge-bit-learning-steps.ts`) takes a state and returns the next state. It has no note knowledge, so it does not change.
- F6. Burying already exists at note level: `buried_until` column, `inReviewRotation`, manual bury endpoint with client time zone, forecast uses `effectiveDue = greatest(due, buried_until)`.
- F7. Both clients drop other queued cards of the same note on grade (iOS `queue.removeAll { knowledgeBitId == }`, web `front.filter(knowledgeBitId !== ...)` on undo). iOS also filters `pendingBits` by note id.
- F8. Latest migration is `0126_triage-inbox-ai-example.sql`; 0127 is free (other sessions may take it first; re-check before generating).

## Architecture decisions

1. Schedule key. Add `card_key text not null default ''` to `knowledge_bit_schedules`; primary key becomes `(knowledge_bit_id, card_key)`. `''` is the legacy note-level row. Independent kinds use the slot key `"<kind>:<order>"` (`cloze:2`, `list_step:3`, `list_overview:0`). Slot keys (not variant ids) so an edit that replaces a variant in the same slot keeps its progress. One shared helper maps a variant to its key; SQL and TypeScript versions are parity-tested.
2. Which kinds are independent: `cloze`, `list_step`, `list_next`, `list_overview`. Everything else keeps `''`.
3. Per-card review log: add `card_key` to `knowledge_bit_reviews` (backfilled from the variant), plus `buried_siblings jsonb` recording what a grade buried, so undo can release exactly that.
4. One "card unit" definition drives all readers. A SQL view `knowledge_bit_cards(knowledge_bit_id, card_key)` lists one row per active unit (distinct `(bit, card_key)` over non-superseded variants). Queue, counts, forecast, mastery totals and the browser join schedules on `(bit, card_key)` against it. A dormant `''` row on a cloze/list note is therefore invisible to every reader.
5. Queue: `pickedVariants` partitions by `(bit, card_key)` instead of by bit. Legacy notes still produce one row; a cloze note with 4 gaps produces 4 rows. All downstream counting (`pickRank = 1`, new = no review-counted schedule row) works unchanged and now counts cards.
6. Burial: on grade, siblings (same bit, other card key, with an active variant) that are not suspended and whose own due is before the burial end get `buried_until = start of next local day`. New siblings with no schedule row get an ungraded row carrying only the burial (same trick the manual bury already uses). Burial uses the existing `buried_until` column and eligibility, nothing new in the queue.
7. Suspend/bury controls: request may name a card; without a card the whole note is affected (fan-out to all card rows). Leech auto-suspend affects only the leeched card.
8. Locking stays per note (`withSubjectLock(bitId)`), so sibling grades, burials and undos serialize.
9. Old `''` rows of backfilled cloze/list notes are left in place (rollback safety, invisible via the view) and deleted by a later cleanup migration after one stable release.
10. Time zone for burial end: optional `tz` on the grade request; when absent, the motivation-settings time zone is used. Day window computed by the existing `getLocalDayWindow`.
11. Sessions scoped to one note (`knowledgeBitId` filter) send `burySiblings: false` so "study this note" shows every gap.

## Migration 0127 (one file, transactional)

Additive in data terms (no column or table dropped, no row removed); the primary key is widened to a superset key.

1. `knowledge_bit_schedules`: add `card_key text not null default ''`; drop PK `(knowledge_bit_id)`; add PK `(knowledge_bit_id, card_key)`; add index on `(knowledge_bit_id)`.
2. `knowledge_bit_reviews`: add `card_key text not null default ''`, `buried_siblings jsonb`; index `(knowledge_bit_id, card_key, reviewed_at)`.
3. Backfill review keys: for reviews whose variant is cloze/list, `card_key = kind || ':' || order` from the variant.
4. Backfill schedules: for every note that has a schedule row and at least one active independent variant, insert one row per active independent variant copying ease, interval, due, last_reviewed_at, review_count, phase, learning_step, lapses, suspended_at, buried_until from the note row. `on conflict do nothing` (re-runnable). Notes with no row stay new. The `''` row is kept.
5. Create the `knowledge_bit_cards` view.
6. Preflight query (run before deploy, abort if non-zero): notes that mix independent and non-independent active kinds. For these the `''` row legitimately stays live for the legacy variants and copies are made for the independent ones; the view and the join rule handle it, but the count is needed to confirm no surprise.

Backfill consequence to accept: every gap of an old note inherits the same due date and ease, so siblings become due the same day; burial then serves one per day. This is the faithful state (they shared one schedule). No jitter.

Generate via drizzle-kit, then hand-edit the SQL for the backfill and view (drizzle cannot emit them); apply through the existing migrate script, never push. Journal index/number conflicts with other sessions' uncommitted work must be re-checked at generation time.

Deploy assumption (verify): migrate runs before the new server starts and no old server instance runs afterwards. Old code's `ON CONFLICT (knowledge_bit_id)` fails after the PK changes. If concurrent old instances are possible, split into an expand migration (columns + unique index on `(knowledge_bit_id, card_key)`, PK kept) and a contract migration (PK swap + backfill) with a flag (`PER_CARD_SCHEDULES`) that maps every key to `''` until the contract migration is applied.

## Touchpoints by area

Scheduling core (`apps/api/src/knowledge-bit/`)
- `knowledge-bit-schedule.repo.ts`: every read/upsert/replace/controls function takes `(bitId, cardKey)`; `inReviewRotation` unchanged; add sibling-burial and sibling-release writers.
- `knowledge-bit-review.orchestrator.ts`: derive key from the variant, read/write that row, bury siblings, record `card_key` and `buried_siblings`, return `buriedVariantIds`; replay by `requestId` returns the stored buried list.
- `knowledge-bit-review.repo.ts`: insert/read review with card key; `hasLaterLiveReviewInTx` scoped to `(bit, card_key)`.
- `knowledge-bit-review-undo*.ts`: resolve key from the review; restore that row; release siblings it buried.
- `knowledge-bit-review-suspension*.ts` and controller route: card-or-note scope.
- New `knowledge-bit-card-key.ts` (+ SQL fragment).

Queue and counts
- `knowledge-bit-review-queue-picked.repo.ts` (partition and join), `-cards.repo.ts` (scoped queue join and group-by), `-learning.repo.ts`, `-counts.repo.ts` (no logic change, verified by tests), `knowledge-bit-review-queue.repo.ts` (card row gains `cardKey`).
- `topic-due.repo.ts`, `subject-review-due-counts.repo.ts`, `study-plan/study-plan-day.repo.ts`, `home/home-study-overview.repo.ts` (consume `picked`, so follow automatically; topic-due joins schedules directly and needs the key join).

Forecast and statistics
- `study-plan/study-forecast.repo.ts`, `review-statistics/review-statistics-forecast.repo.ts`: join the view; one forecast entry per card; burial already honoured via `effectiveDue`; replace "exists any active variant of the bit" with "card key is an active unit".
- `review-statistics/review-statistics-history.repo.ts`: no change (per-review rows; `prev_schedule->>'phase'` still describes that card).
- `motivation/motivation-mastery.repo.ts` (card totals/mastered: count units from the view), `motivation/motivation-activity.repo.ts` (`countDueBefore` joins the view; average-time and long-gap queries unchanged), `gamification/rebuild-review-points.ts` (uses schedule + reviews; must read per card key).

Goals, streak, points
- Study goal activity, motivation activity, streak and point events count review rows: unchanged and correct per card. Point event dedupe is per `review_id`, so N cards give N points; sibling burial limits this to roughly one card per note per day. "Solid" counters count distinct notes; kept note-level on purpose (a note counts once per window).

Note-level displays (aggregate across cards)
- Browser filters/overview/detail/export/suspended list: a cloze/list note shows the aggregate: state = suspended if all cards suspended, buried if all buried, new if no card reviewed, otherwise earliest due and max lapses; detail adds a per-card list. Suspended list gets card rows so a single suspended gap is restorable.

Cleanup/merge
- `knowledge-bit-delete.repo.ts`, `knowledge-cleanup.repo.ts`: deletes by bit id already remove all card rows.
- Note/list edit repos (`knowledge-bit-note-edit.repo.ts`, `knowledge-bit-list-edit.repo.ts`): on removed slot delete that card's schedule row in the same transaction; added slot starts new; replaced slot keeps its row. If every existing card of the note is suspended, a newly added card inherits suspension.

Shared contracts (`packages/shared/src/knowledge-bit-review.ts`): see spec.md.

Clients
- Web (`apps/web/src/knowledge-bit/anki-review-session*.ts`, `anki-review.api.ts`, `anki-review-card-actions.tsx`): drop `buriedVariantIds` from the local queue after a grade; undo reinserts the card at the front by variant id; suspend/bury send the card; sibling dedupe keyed by variant id where a card (not a note) is meant.
- iOS (`Sources/Shared/DueReviewModel+Grading.swift`, `+Loading.swift`, `Packages/PostAnkiAPI/.../ScheduledReviewModels.swift`, `APIClient+ScheduledReview.swift`): decode `cardKey` (optional), `buriedVariantIds`; replace `removeAll { knowledgeBitId }` with removal by the returned ids; `pendingBits` filter by note only for legacy kinds; suspend/bury pass the variant id.
- Old builds keep working: they ignore new fields, send grade by `variantId` and undo by `reviewId`. Their note-level suspend/bury (no card named) acts on the whole note; their local "drop same-note cards" keeps mirroring burial.

## Rollout order

1. Preflight query (mixed notes, count of backfill rows) on the real data.
2. Land shared contracts (additive optional fields) and the card-key helper with parity tests.
3. Land server changes in one PR: schema + migration 0127 + schedule/review/undo/suspension + queue/counts + forecast/stats + edit repos. Not splittable safely once the PK is widened, because queue and grade must agree on keys.
4. Deploy: stop server, run migrate, start server (verify this is how deploys run).
5. Verify on real data: queue counts before/after match for legacy notes; a cloze note shows N cards in the browser; grade one, siblings vanish; undo restores.
6. Web client update, then iOS (xcodegen, swift test, simulator build, dev build per the native-app rule). Servers work with old clients, so order among clients is free.
7. Docs: `docs/architecture/knowledge-bit/anki-review.md` (schedule key, burial, queue rule), `variant-generation.md` (edits keep slot progress).
8. After one stable release: cleanup migration deleting the dormant `''` rows of cloze/list-only notes.

## Tests (summary; detail in scenarios.md)

- Unit: card-key helper (TS/SQL parity), burial derivation, undo derivation with siblings, edit-slot rules.
- Integration (Postgres, existing `*.integration.test.ts` style): migration backfill, queue per-card, burial on grade, undo releases, counts/forecast/mastery, edit keeps progress, scoped session, requestId replay.
- Route: grade/undo/control payload shapes, old-client payloads still accepted.
- Web: session reducer (grade drops buried ids, undo reinserts), actions. iOS: model decoding with and without new fields, queue removal, undo.
- Regression: all existing queue/count/undo/suspension tests for legacy kinds pass unchanged.

## Risks

- R1. Widening the PK breaks old server code mid-deploy (see deploy assumption).
- R2. Any reader joining schedules by `knowledge_bit_id` only silently double-counts or picks an arbitrary card row. Mitigation: grep gate in CI/test for `knowledgeBitSchedules.knowledgeBitId` joins outside the allowed helpers; the audit list above has about 20 files.
- R3. Learning pace: with burial, a note's N new gaps appear one per day (N days to see them all once). That is Anki behaviour but slower than today's rotation. Consider a later per-subject "bury siblings" option.
- R4. Backfill makes siblings due the same day (accepted, see above).
- R5. Old clients suspend the whole note when the user meant one card.
- R6. Position-keyed list slots: inserting a mid-list step shifts later cards onto earlier schedules (already documented default).
- R7. Migration number/journal contention with other sessions' uncommitted work.
- R8. Mixed notes (independent + legacy kinds) are assumed not to exist; the preflight query decides.

## Decisions for the owner

- D1. Burial includes new siblings and learning-phase siblings (default yes; this plan follows Anki's default and the request).
- D2. Is a single migration acceptable given the deploy assumption, or split expand/contract with a flag?
- D3. Note-level "solid/mastered" counters stay note-level (default) or become card-level?
