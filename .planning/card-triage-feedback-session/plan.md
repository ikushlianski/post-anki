# Plan: card-triage-feedback-session (explicit start/finish, per-card feedback, analysis record)

## Business (what changes for the owner)
- Triage starts only when you press Start (web and iOS); the start is recorded. Finishing is also its own recorded action, allowed at any moment, even with zero decisions or cards left undecided.
- Undecided cards are never touched by Finish: they stay in the pending queue for the next triage.
- Every accept and reject can carry an optional note, and a rejected card an optional reason. You can add or change them after deciding, until you finish. The whole session can also get one overall comment.
- Each decision is stored with the session, so you can later ask "why were these cards rejected" (which card kinds, which model, how fast, which reasons, what was undone).
- A session you walk away from stays open and resumable on the same device. Discard is a real recorded action, no longer only a local clear.
- No new AI calls. The existing single style-notes step also reads the per-card reasons and notes.

## Facts (cited)
1. Web Start is explicit: button `apps/web/src/card-triage/triage-session-bar.tsx:19-27`, key `s` `triage-session-section.tsx:15-23`, call `use-triage-session.ts:66-90`. Finish is explicit (`triage-session-bar.tsx:55-62`, `use-triage-session.ts:92-127`). Skip sends empty feedback and zero decisions are valid (`triage-session-section.tsx:24-28`). Web Discard only clears localStorage and the server row stays `open` forever (`use-triage-session.ts:129-137`).
2. iOS Start is implicit. The "Start triage" button (`apps/ios/Sources/Shared/pending-review-inbox-summary.swift:36`, handler `PendingReviewScreen.swift:221-226`) only opens the cover. The session POST fires from `.task` in `focus-triage-view.swift:22-26`. After ingest the cover auto-opens with no tap (`PendingReviewScreen.swift:116`, used by `IngestionDictationScreen.swift:162`). If the POST fails, triage continues unrecorded and Finish says "wasn't saved" (`focus-triage-view.swift:142-145`). Finish works any time and with zero decisions (`focus-triage-session-model.swift:79-109`). Discard is local only (`:111-121`). The "List" button closes the cover and leaves the session open (`PendingReviewScreen.swift:155`); resume comes from UserDefaults (`focus-triage-session-store.swift`). The Mac triage view has no session at all (no session code in `pending-review-triage-*.swift`).
3. API lifecycle: `apps/api/src/card-triage/card-triage-session.controller.ts:13-89`, `card-triage-session.repo.ts:30-84`. Start always inserts a new row (not idempotent). A second finish returns 409 (`controller:58-61`). Finish stores `accepted/rejected` counts (client-claimed decisions confirmed against feedback rows, `card-triage-decision-count.repo.ts:13-58`), `feedback_text`, status `distilled` (empty text) or `saved_text_only` (`repo:77-78`). Distill needs non-empty overall text (`card-triage-distill.orchestrator.ts:83-85`). Finish never changes cards.
4. Per session the table keeps only: id, subject_id, started_at, ended_at, status, accepted/rejected counts, feedback_text (`apps/api/src/db/schema.ts:1395-1404`, migration `0105_card-triage-sessions.sql`). Latest migration is `0116`; next is `0117`.
5. Per decision there is no session id. `knowledge_bit_feedback` (`schema.ts:1366-1393`) holds verdict, reason_code, note, model_id, extraction_run, card snapshot, created_at. Session membership is guessed by `created_at >= started_at` (`card-triage-decision-count.repo.ts:29-31`, `distill orchestrator:21-27`). Undo deletes or reverts the row (`knowledge-bit-feedback-restore.repo.ts:37-60`), so undone decisions vanish. Approve and reject take no body (`knowledge-bit-approval.controller.ts:32-67`). No dwell time, order index, or variant kinds are stored.
6. Per-card optional text exists but is not session-keyed and is write-once. Web: `knowledge-bit-review-panel.tsx:176-208` (reject: PATCH `/knowledge-bit-feedback/:id` note; approve: fake grade rating 3 with note). iOS: `focus-triage-model.swift:108-123`, field `focus-triage-card.swift:116-126`. A fixed reject-reason enum already exists (`packages/shared/src/knowledge-bit-review-feedback.ts:3-12`, note max 500 at `:36`), used by the regular review panel.
7. Available generation context: bit `review_flag`, `origin`, source `extraction_model_id`, `extraction_run`, `subject_id`, variant `kind` (`schema.ts:1105-1290`). No prompt version is stored anywhere.

## Gaps vs the request
- G1 iOS has no separate Start; a failed start silently drops recording; auto-open on ingest starts a session without a tap.
- G2 Discard unrecorded (both clients); open rows pile up; repeat start/finish not idempotent.
- G3 No session-keyed decision record: no order, dwell, kinds, undone flag, session id.
- G4 Per-card text is not editable after the decision and not tied to a session. Overall feedback exists.
- G5 Per-card reasons and notes never reach the distill step, which is skipped when overall text is empty.

## Design
Contract (zod, `packages/shared/src/card-triage-session.ts` plus new `card-triage-decision.ts`, exported via index; additive, old clients keep working):
- `POST /triage-sessions` body gains optional `client` (web|ios|mac) and `startKey` (client uuid). A replay with the same key returns the same session with 200 (new: 201). Response gains `client`, `endedBy`, `lastActivityAt`.
- `PUT /triage-sessions/:id/decisions/:bitId` (idempotent upsert) body `{verdict, note?, reasonCode?, dwellMs?}`. Same live verdict: updates note/reason only. Different verdict: marks the old row undone and inserts a new one. 409 `session_finished`, 409 `decision_not_applied` (bit not in the claimed state), 404.
- `DELETE /triage-sessions/:id/decisions/:bitId` sets `undone_at` on the live row (row kept). `GET /triage-sessions/:id/decisions` lists rows for the finish screen.
- `POST /triage-sessions/:id/finish` keeps its path. Body gains optional `undecidedCount`; `decisions[]` items gain optional `note`, `reasonCode`, `dwellMs`. A repeat finish returns 200 with the stored session and no side effects (was 409). New `POST /triage-sessions/:id/discards` (same noun style as `/knowledge-sources/:id/discards`): status `discarded`, no distill.
- Finish reconciles first: each claimed decision without a live row is backfilled (source `reconciled`) after the existing confirmation check, so old app builds still produce rows. Counts are then taken from live rows, so undone decisions never count.

Migration `0117_card-triage-decisions` (drizzle-generated, run by `npm run db:migrate`, never push). `card_triage_sessions` add: `client` text, `start_key` text (partial unique where not null), `ended_by` text (user|discarded), `undecided_count` int, `last_activity_at` timestamptz (all nullable; why: who/how it ended, retry safety, abandonment analysis). Statuses gain `discarded`.
New table `card_triage_decisions` (decision facts insert-only; only `note`, `reason_code`, `undone_at` ever change; one live row per session+bit via partial unique index):
- `id` ctd_; `session_id` (index with `order_index`); `knowledge_bit_id` (index): join keys.
- `verdict` approved|rejected; `reason_code` (existing enum, rejected only), `note` (max 500): the why.
- `decided_at`, `order_index` (server, per session), `ms_since_previous` (server), `dwell_ms` (client, clamped): fatigue and speed analysis.
- `subject_id`, `knowledge_source_id`, `extraction_model_id`, `extraction_run`, `review_flag`: where the card came from (the only generation context stored; flags kept as-is).
- `variants` jsonb `[{id,kind,kept}]`, `front`, `back` (clipped to 600 like feedback snapshots): card kind and text survive undo and later edits.
- `undone_at`, `source` (client|reconciled), `feedback_id` (link to the legacy feedback row, nullable).
Enrichment runs server side at PUT time from the bit, source and variants, in one transaction that also bumps `last_activity_at`. For a rejected decision with a reason, the server also calls the existing `updateKnowledgeBitFeedback` so the extraction prompt keeps its reasons.
Distill: `DistillerInput` gains `cardFeedback` (up to 20 live rows that have a note or real reason, rejected first, each 160 chars, escaped like the other untrusted blocks); the agent instructions and prompt add one untrusted block. Distill runs when overall text OR any card feedback exists. Existing `rejectedExamples` stays.
Surfaces: the finish screen shows this session's decisions (rejected expanded, accepted collapsed) with note field and reason chips (existing enum labels), editable until finish. The decision-time note field stays as today. Legacy note calls stay untouched; the same text is also sent through PUT.

## Work units (order: 1, then 2 and 3 in parallel)
### Unit 1: API + shared contract + migration (lands first)
Owns: `packages/shared/src/card-triage-session.ts` (+test), new `packages/shared/src/card-triage-decision.ts` (+test), `packages/shared/src/index.ts` export line; `apps/api/src/db/schema.ts` (triage block only), `apps/api/src/db/migrations/0117_*.sql` and `meta/`; in `apps/api/src/card-triage/`: `card-triage-session.repo.ts`, `card-triage-session.controller.ts`, `card-triage-distill.orchestrator.ts`, `card-triage-decision-count.repo.ts`, new `card-triage-decision.repo.ts`, `card-triage-decision-context.repo.ts`, `card-triage-decision.controller.ts`; `apps/api/src/mastra/card-style-notes-distiller.agent.ts`; `apps/api/src/router.ts`, `router-table.ts`, `api-server.ts` (triage cases only).
Accept: all routes above work; repeat start and repeat finish are idempotent; finish with zero decisions works; discard records `ended_by=discarded`; old-shape bodies still pass; no card or feedback data is logged.
Tests (vitest, co-located): `card-triage-decision.controller.test.ts` (400/404/409 mapping), `card-triage-session.controller.test.ts` (update 409-on-repeat to 200, add discard, startKey replay), `card-triage.routes.test.ts` (new routes), `card-triage-decision.repo.integration.test.ts` in the style of `card-triage.integration.test.ts` (enrichment, order and gaps, change-of-verdict creates a new row, undo keeps the row, counts exclude undone, reconcile backfills old-client finish, edit blocked after finish), distill orchestrator test (runs with only card feedback, cap of 20 and 160 chars), distiller prompt test (block escaped, injection text stays inside it), shared schema tests.
### Unit 2: Web
Owns: `apps/web/src/card-triage/card-triage.api.ts`, `use-triage-session.ts`, `triage-session-section.tsx`, `triage-feedback-panel.tsx`, `triage-session-storage.ts`, new `triage-decisions-list.tsx`; `apps/web/src/knowledge-bit/use-review-decisions.ts` and `knowledge-bit-review-panel.tsx` (optional decided/undone callbacks and note wiring only).
Accept: Start sends `client:"web"` and a `startKey`; each approve/reject/keep sends PUT with measured dwell and any note (failure shows a small notice and never blocks the queue; finish payload carries the notes as fallback); undo sends DELETE; Finish sends `undecidedCount`; Discard also calls the server (404/409 ignored); finish screen lists decisions with editable note/reason until Save or Skip; zero-decision finish still works.
Tests: extend `triage-session-panel.test.tsx`, `triage-session-recovery.test.tsx`, `triage-session-section.test.tsx`, `use-review-decisions.test.ts`; new `triage-decisions-list.test.tsx`.
### Unit 3: iOS (SwiftUI)
Owns: `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/triage-session-client.swift`, `triage-session-models.swift`, new `triage-decision-models.swift`; `apps/ios/Sources/Shared/`: `focus-triage-session-model.swift`, `focus-triage-session-store.swift`, `focus-triage-model.swift`, `focus-triage-decision-log.swift`, `focus-triage-view.swift`, `focus-triage-done.swift`, new `focus-triage-decision-list.swift`, `pending-review-inbox-summary.swift`, `PendingReviewScreen.swift`.
Accept: tapping Start awaits the session POST (`client:"ios"`, `startKey`), shows an error with retry on failure and does not open triage; `.task` in the focus view no longer starts a session, it only resumes a stored one; the ingest auto-open (`PendingReviewScreen.swift:116`) opens only when a stored session exists, otherwise the user sees the Start button; decisions, undo and discard call the new routes; finish screen lists decisions with editable note and reason chips; Finish sends `undecidedCount`. Mac triage view unchanged.
Tests: `swift test` in `apps/ios/Packages/PostAnkiAPI`: extend `Tests/PostAnkiAPITests/triage-session-contract-tests.swift`, new `triage-decision-contract-tests.swift` plus fixtures. Mac smoke target (`apps/ios/Tests/PostAnkiMacSmokeTests/`): extend `focus-triage-session-smoke-tests.swift` and `focus-triage-model-smoke-tests.swift`, new `focus-triage-start-smoke-tests.swift` (start failure keeps triage closed, no auto start, resume, discard hits server).

## Tests summary
Behavior-named business guarantees: a rejected card keeps its reason and note in the session record after undo; Finish with nothing decided still closes the session; a retried Start never creates a second session; old app builds still get decision rows at finish; notes cannot be edited after finish.

## Risks
- Privacy: notes and card text are user data. Never logged (log ids and counts only); distill text is escaped and treated as untrusted; the failure log must not carry the prompt.
- Live-table migration: additive only (new nullable columns, new table, small-table indexes); no backfill, so analysis starts from the first new session; old rows have no decisions.
- Backward compat: installed iOS builds and the current web keep working because every new field is optional. Repeat finish moves from 409 to 200, which both old clients treat as success. A `discarded` status is only returned to new clients; the old web zod enum would reject it, so web ships after the API.
- Cost: no new LLM call; the distill prompt grows by at most about 3.5 KB on the cheap tier.
- Trust: PUT checks the bit really is approved or rejected so the record cannot claim decisions that did not happen.
- Known limit: an open session abandoned on another device is not resumable there; `last_activity_at` allows a later sweep, none is built now.

## Defaults chosen
- Membership via a separate idempotent PUT per bit, not a new parameter on approve/reject: keeps the hot path and old clients untouched.
- One live decision per bit per session; a change creates a new row and marks the old undone: keeps history analyzable.
- Reject reasons reuse the existing 8-value enum, optional, offered only on the finish list: no new vocabulary, cheap on both clients; free text stays primary.
- Edits allowed until finish, read-only after: matches "until the session finishes".
- Idempotent start through a client key; repeat finish returns the stored session: safe retries on bad networks.
- Open sessions are never auto-closed; resume stays local per device as today: matches current recovery.
- Undecided cards stay pending and only the count is recorded: decisions are already applied per card.
- iOS blocks triage when Start fails: a registered start is the request; retry is offered.
- Mac stays out of scope (no session there today); `client` still allows `mac`.
- Legacy note calls stay and PUT also carries the note: no change to rating statistics or extraction feedback.
- Distill runs on overall text or card feedback, capped at 20 items of 160 chars, one call: uses the new signal at no extra call cost.
- No prompt-version column: the value is not stored anywhere; model and extraction run are recorded instead.
- Status `distilled` for empty finishes keeps its current meaning; no rename in this work.

END-OF-REPORT
