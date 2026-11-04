# Spec: per-card schedules (exact contracts)

Time-zone and clock values are UTC instants unless stated. "Independent kinds" = `cloze`, `list_step`, `list_next`, `list_overview`.

## 1. Card key

```
cardKey(variant) = independent(variant.kind) ? `${variant.kind}:${variant.order}` : ""
```
- Shared TS: `packages/shared/src/card-key.ts` exports `INDEPENDENT_CARD_KINDS`, `isIndependentCardKind(kind)`, `cardKeyFor({ kind, order })`, zod `cardKeySchema = z.string().regex(/^(|(cloze|list_step|list_next|list_overview):\d+)$/)`.
- SQL (single source in `apps/api/src/knowledge-bit/knowledge-bit-card-key.ts`): `case when v.kind in ('cloze','list_step','list_next','list_overview') then v.kind || ':' || v."order" else '' end`. A test asserts TS and SQL agree for every kind and orders 0..20.
- `order` is the slot; supersede-and-replace keeps key. Orders are not renumbered.

## 2. Schema

### knowledge_bit_schedules
Existing columns unchanged. Added:
| column | type | notes |
|---|---|---|
| card_key | text not null default '' | `''` = legacy note-level row |

PK `(knowledge_bit_id, card_key)`; index `knowledge_bit_schedules_bit_idx (knowledge_bit_id)`. Drizzle: `primaryKey({ columns: [t.knowledgeBitId, t.cardKey] })`; `KnowledgeBitScheduleSnapshot` unchanged (snapshot belongs to one card; the key is stored beside it on the review row).

### knowledge_bit_reviews
| column | type | notes |
|---|---|---|
| card_key | text not null default '' | key of the graded card |
| buried_siblings | jsonb null | `BuriedSibling[]`, written only by grade |

```ts
interface BuriedSibling {
  cardKey: string;
  prevBuriedUntil: string | null; // ISO, before this grade
  buriedUntil: string;            // ISO, value this grade wrote
  createdRow: boolean;            // row did not exist before this grade
}
```
Index `knowledge_bit_reviews_bit_card_reviewed_idx (knowledge_bit_id, card_key, reviewed_at)`.

### View knowledge_bit_cards
```sql
create view knowledge_bit_cards as
select distinct v.knowledge_bit_id, <cardKeySql> as card_key
from knowledge_bit_question_variants v
where v.superseded_at is null;
```
Drizzle: `pgView("knowledge_bit_cards", {...}).existing()`. Every reader that counts or lists cards joins `knowledge_bit_cards c` then `left join knowledge_bit_schedules s on s.knowledge_bit_id = c.knowledge_bit_id and s.card_key = c.card_key`.

### Migration 0127 SQL outline (hand-edited after drizzle-kit generate)
```sql
alter table knowledge_bit_schedules add column card_key text not null default '';
alter table knowledge_bit_schedules drop constraint knowledge_bit_schedules_pkey;
alter table knowledge_bit_schedules add primary key (knowledge_bit_id, card_key);
create index knowledge_bit_schedules_bit_idx on knowledge_bit_schedules (knowledge_bit_id);

alter table knowledge_bit_reviews add column card_key text not null default '';
alter table knowledge_bit_reviews add column buried_siblings jsonb;
create index knowledge_bit_reviews_bit_card_reviewed_idx on knowledge_bit_reviews (knowledge_bit_id, card_key, reviewed_at);

update knowledge_bit_reviews r set card_key = v.kind || ':' || v."order"
from knowledge_bit_question_variants v
where v.id = r.variant_id and v.kind in ('cloze','list_step','list_next','list_overview');

create view knowledge_bit_cards as ...;

insert into knowledge_bit_schedules (knowledge_bit_id, card_key, ease_factor, interval_days, due_at,
  last_reviewed_at, review_count, phase, learning_step, lapses, suspended_at, buried_until)
select s.knowledge_bit_id, c.card_key, s.ease_factor, s.interval_days, s.due_at, s.last_reviewed_at,
  s.review_count, s.phase, s.learning_step, s.lapses, s.suspended_at, s.buried_until
from knowledge_bit_schedules s
join knowledge_bit_cards c on c.knowledge_bit_id = s.knowledge_bit_id and c.card_key <> ''
where s.card_key = ''
on conflict do nothing;
```
Look up the real PK constraint name in the previous snapshot before writing the drop. Down/rollback: delete rows with `card_key <> ''` after copying the most recently reviewed one back onto the `''` row, drop columns/view; document in the migration header.

## 3. Shared API contracts (`packages/shared/src/knowledge-bit-review.ts`)

All new fields optional or additive; old clients parse unchanged.

```ts
// queue card
reviewCardSchema += { cardKey: cardKeySchema.optional() }

// POST grade
recordReviewInputSchema += {
  tz: z.string().min(1).refine(isValidTimeZone).optional(),   // burial day end; default motivation-settings tz
  burySiblings: z.boolean().default(true),
}
recordReviewResultSchema += {
  cardKey: cardKeySchema,
  buriedVariantIds: z.array(z.string()),   // active variants of siblings buried by this grade
}

// POST undo result
undoReviewResultSchema = { knowledgeBitId: z.string(), variantId: z.string(), cardKey: cardKeySchema,
  unburiedVariantIds: z.array(z.string()) }

// PATCH schedule controls
scheduleControlInputSchema += { variantId: z.string().min(1).optional() }   // absent = whole note
scheduleControlResultSchema += { cardKey: cardKeySchema.nullable() }        // null = whole note
```
`variantId` must belong to `:id` (the note); otherwise 404 `variant_not_found`. `scheduleControlResultSchema.suspended/buriedUntil` for a whole-note call report "all cards suspended / latest buriedUntil among cards".

HTTP codes unchanged: grade 201 / 403 `not_approved` / 404 `variant_not_found`; undo 200 / 404 `review_not_found` / 409 `not_latest`; control 200 / 403 / 404.

## 4. Grade (`recordKnowledgeBitReview`)

Inside `withSubjectLock(bitId)`:
1. `cardKey = cardKeyFor(variant)`.
2. `stored = readSchedule(tx, bitId, cardKey)`; `previous = stored && stored.reviewCount > 0 ? stored : null` (as today).
3. `next = deriveGradeSchedule(previous, grade, now, options)` (unchanged); leech via card's `lapses`.
4. Upsert row `(bitId, cardKey)`; `ON CONFLICT (knowledge_bit_id, card_key)`.
5. If `burySiblings` and the key is independent: `buryUntil = getLocalDayWindow(tz ?? motivationTz, now).endsAt`. For each active card unit `(bitId, k)`, `k != cardKey`:
   - skip if its row is suspended;
   - skip if row exists with `due_at >= buryUntil` (already out of today's queue) and `buried_until` null or >= buryUntil;
   - skip if `buried_until >= buryUntil`;
   - else upsert `buried_until = buryUntil` (row created with `review_count 0, phase 'new'` if missing; record `createdRow`).
   Collect `BuriedSibling[]`.
6. Insert review row with `card_key`, `prev_schedule` (that card's row, same shape as today), `buried_siblings` (null when none).
7. Award point event (unchanged, keyed by review id).
8. Result adds `cardKey`, `buriedVariantIds` = active variant ids whose `cardKey` is in the buried set.

Replay by `requestId`: re-derive as today and return the stored `buried_siblings` mapped to variant ids (no writes).

## 5. Undo (`undoKnowledgeBitReview`)

Inside `withSubjectLock(bitId)`:
1. Read review (now includes `cardKey`, `buriedSiblings`). Not found or `undone_at` set: as today.
2. `current = readSchedule(bitId, review.cardKey)`; `laterLive = hasLaterLiveReview(bitId, review.cardKey, reviewedAt, id)` (same card only).
3. `deriveReviewUndo` unchanged logic, but operates on that card's row: not_latest if undone, later live review of the same card, no row, or `current.lastReviewedAt != review.reviewedAt`.
4. Replace that card's row; mark review undone; void point event.
5. For each `BuriedSibling` b: read sibling row; if `row.buried_until == b.buriedUntil` and no live review of that sibling after `review.reviewedAt`: set `buried_until = b.prevBuriedUntil`; if `b.createdRow` and row `review_count = 0` and not suspended and `prevBuriedUntil` null: delete the row. Otherwise leave it (user changed it since).
6. Result: `{ knowledgeBitId, variantId: review.variantId, cardKey, unburiedVariantIds }`.

Undo of a manual suspend/bury stays a control call (`suspended:false` / `buried:false`) carrying the same `variantId` the original call used.

## 6. Controls (`updateKnowledgeBitScheduleControls`)

- `variantId` present: `(bitId, cardKeyFor(variant))` row only, `deriveSuspensionChange` unchanged.
- `variantId` absent and note has independent cards: apply to every active card unit (insert ungraded rows as needed); `suspended:false` clears all; `buried:true` sets all to day end.
- `variantId` absent, legacy note: key `''` as today.
- Leech auto-suspend (grade): only the graded card.

## 7. Queue

`pickedVariants` changes:
- add select `cardKey` (SQL above).
- `pickRank = row_number() over (partition by bit.id, <cardKeySql> order by lastShownAt, kindRank, createdAt, id)`. For independent keys exactly one active variant exists per key, so rank is 1; legacy partition `(bit, '')` is the old behaviour.
- `leftJoin knowledge_bit_schedules s on s.knowledge_bit_id = bit.id and s.card_key = <cardKeySql>`.
- `eligibility` unchanged (`inReviewRotation` now evaluates on the card's row).
- Output column `scheduleBitId` keeps its meaning (non-null iff `review_count > 0`) so counts need no edit; `cardKey` added to `Picked`.

`listScopedCards`: join schedules on `(bit, cardKey)`; `reviewCount` (least-shown ordering) stays per variant; group by adds the card key. Scoped (`knowledgeBitId`) queue returns every unburied card of the note; with `burySiblings:false` grading, all cards stay available.

Ordering for due lists is unchanged (learning first, then due_at, then variant id). Add a stable tiebreak so siblings of one note are not adjacent: none required because burial prevents siblings coexisting; a test asserts the queue never contains two same-note cards when burial is active.

`toCard` returns `cardKey`. `intervalPreview` is computed from the card's own state (already from the joined row).

New-card daily cap: `countNewCardsReviewedTodayBySubject` counts `was_new` review rows; each first review of a gap is one new card. `fresh` count (`scheduleBitId is null`) is per card. Burial hides new siblings (their ungraded row has `buried_until`), so `fresh` drops accordingly until tomorrow.

## 8. Counts

All derived from `picked` with `pickRank = 1`, now card-based; no query change beyond `picked`:
- `ReviewCounts { new, learning, review }` in queue response, home snapshot, subject due counts, plan-day counts, topic due.
- Buried cards are excluded from all three (eligibility), included in `nextDueAt` logic only via the existing `min(dueAt) > now`; add: `nextDueAt = min(nextDue, earliest buried_until)` is NOT added (unchanged behaviour for manual burial).
- Learn-ahead: unchanged.

## 9. Forecast and statistics

Forecast (`study-forecast.repo.ts`, `review-statistics-forecast.repo.ts`):
```sql
from knowledge_bit_cards c
join knowledge_bit_schedules s on s.knowledge_bit_id = c.knowledge_bit_id and s.card_key = c.card_key
join knowledge_bits b on b.id = c.knowledge_bit_id
where s.suspended_at is null and s.review_count > 0 and <existing filters>
```
`effectiveDue = greatest(s.due_at, coalesce(s.buried_until, s.due_at))` unchanged: buried siblings forecast on tomorrow.

Mastery totals (`readSubjectCardTotals`): `count(*)` over `knowledge_bit_cards` left-joined to schedules (cards, not notes); `mastered` = `interval_days >= MASTERED_INTERVAL_DAYS` per card row. `countDueBefore`: join the view; suspended excluded.

Retention/history/streak/goals/points: no change (per review row). `rebuild-review-points.ts`: reads schedule by `(bit, review.card_key)`.

## 10. Note-level aggregate for displays

For browser list/overview/export: one row per note with
`state = suspended if all cards suspended; buried if all (non-suspended) buried; new if no card has review_count>0; else min-due phase`, `dueAt = min(due_at)`, `lapses = max`, `cardCount`, `dueCardCount`. Detail response adds `cards: [{ variantId, cardKey, kind, order, state, dueAt, lapses, suspended, buried }]`. Browser filters (state) match a note if any card matches except `suspended`/`buried` (all cards). The suspended list returns one row per suspended card (`variantId`, `cardKey`) plus note id.

## 11. Edit interactions

In the note/list edit transaction (same lock):
- Slot kept (variant replaced): schedule row kept.
- Slot removed (variant superseded, no active variant for that key): `delete from knowledge_bit_schedules where (bit, key)`. Review history rows stay; undo of those reviews answers 409 `not_latest` (no current row).
- Slot added: no row = new.
- Added card when every existing card is suspended: insert row `suspended_at = now, review_count 0, phase 'new'`.
- Plain-card (non cloze/list) edits unaffected.

## 12. Clients

Web (`apps/web/src/knowledge-bit`):
- `ReviewCard.cardKey` optional. Session actions after grade: `dispatch({ type: 'graded', buriedVariantIds })` removes those ids from `front` (and keeps same-note cards whose id is not listed).
- Undo: call undo, then `undone` reinserts the entry card at the front and removes only duplicates of the same `variantId` (not of the same note). Unburied siblings return on next queue fetch.
- Suspend/bury send `variantId` of the current card.
- Scoped session by note id sends `burySiblings: false`.

iOS:
- `ReviewCard` gains `cardKey: String?` (decodeIfPresent). `RecordReviewResult` gains `cardKey`, `buriedVariantIds` (default `[]` when absent). `UndoReviewResult` gains `variantId`, `unburiedVariantIds`.
- `DueReviewModel+Grading`: remove from `queue` by `buriedVariantIds` plus the graded card; no longer `removeAll { knowledgeBitId }` for independent kinds. `gradeQueue.enqueue(input, knowledgeBitId:)` keeps its serialization per note (siblings grade one after another; preserves server lock order).
- `DueReviewModel+Loading`: `pendingBits` filter applies per note only for cards whose `cardKey` is empty/nil; independent cards filtered by `variantId` via `skippedVariantIds`/pending variant ids.
- Controls pass `variantId`.
- Offline/pending queue: pending grades for a note are replayed in order; `requestId` idempotency retained.

## 13. Validation and error rules

- Grade for a variant with `approvalState != approved`: `not_approved` (unchanged).
- Grade for a superseded variant: processed against the slot key (the replacement's schedule); `buriedVariantIds` computed from active variants only.
- `tz` invalid: 400 `invalid_input`.
- Control `variantId` not in note: 404 `variant_not_found`.

## 14. Docs to update with the change

`docs/architecture/knowledge-bit/anki-review.md`: schedule key, sibling burial rule, queue rule, undo rule. `variant-generation.md`: slot-keyed progress on edit, removal deletes schedule.
