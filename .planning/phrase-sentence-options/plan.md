# phrase-sentence-options: plan

## Goal
Each imported meeting phrase arrives in Triage with three example sentences that contain it; the user picks one (Up/Down, Return = good, X = no) and that sentence becomes the card back, with larger question and answer text on web, iOS and Mac.

## Findings (facts from code)
- One bit already carries many cards: `LessonDraft.cards[]` becomes `knowledge_bit_question_variants` rows, `order` = index, so 3 basic variants fit with no schema change (`knowledge-bit-source-items.repo.ts:163`).
- "Approve" on variants = `POST /knowledge-bits/:id/triage {keepVariantIds}`: keeps those, sets the rest `supersededAt`, approves the bit (`knowledge-bit-triage.repo.ts`). Undo = `/triage/undo` with the dropped ids. Web `keepVariants`, Mac `keep([ids])` (`PendingDecisionQueue`) already call it. Plain approve keeps ALL variants (3 cards), so it must not be used for option sets.
- Today: one call per phrase (`ATTEMPTS = 2` only on bad output); card = situation front, phrase back; native has no AI-suggestion display (out of scope).

## Approach (no new module, no migration, no new endpoint)
- Same call returns `sentences`. Builder emits 3 `basic` cards sharing one front (situation), back = sentence; bit body stays the phrase.
- Server marks a pending bit `answerChoice: true` when its source kind is `phrase` and it has 2+ active variants (derived in `listPendingKnowledgeBitsForReview`; additive field on `PendingKnowledgeBitForReview`).
- Triage UI for `answerChoice` bits: front once, options as a single-select list. Return/Approve = `keep([selectedId])`; X/Reject = existing reject (all options dropped).
- Server safety net: plain approve on a phrase bit with 2+ variants keeps only the first option; bulk approve skips phrase bits (`needs_manual_review`).

## Slice 1: API + shared (first)
1. `packages/shared/src/knowledge-bit.ts`: add `answerChoice?: boolean` to `PendingKnowledgeBitForReview`.
2. `knowledge-bit-meeting-phrase.agent.ts`: extend `meetingPhraseResultSchema` with `sentences: z.array(z.string().min(1).max(200)).max(3)`, field order after `suggestion`. `knowledge-bit-meeting-phrase.prompt.ts`: add "sentences: exactly 3 natural sentences a person says in a work meeting. Each contains the target phrase word for word (target = your suggestion when looksNonNative, else the phrase), never reworded. Different registers/contexts (formal, neutral, casual). Never include the situation. A phrase that is already a sentence may get a lead-in or follow-up."
3. `meeting-phrase-draft.ts`: `buildPhraseLesson` builds one card per valid sentence: keep a sentence if `comparable(sentence)` contains `comparable(target)` (reuse `comparable`), trim, dedupe, max 3. No valid sentence: return null from a new `pickSentences` and let the runner decide (step 4). Front/flag/`aiSuggestion` rules unchanged.
4. Runner: no valid sentence counts as a failed attempt (same `ATTEMPTS = 2` loop, same call count); after the last attempt fall back to today's single card (back = phrase) so the import never fails. One call per phrase when the first answer is good.
5. `knowledge-bit-triage.repo.ts`: extract `supersedeOtherVariantsIn(tx, bitId, keepIds)`; `knowledge-bit-approval.repo.ts`: `approveKnowledgeBit` calls it with the first active variant when the source kind is `phrase` and 2+ variants are active; `listPendingKnowledgeBitsForReview` selects `knowledgeSources.kind` and sets `answerChoice`.
6. `knowledge-bit-bulk-approval.repo.ts`: exclude phrase-source bits from the atomic UPDATE and classify them `needs_manual_review`.
7. Backfill `apps/api/scripts/backfill-phrase-sentences.ts` + `npm run backfill:phrase-sentences`, modelled on `reextract-knowledge-sources.ts` (dry run by default, `--apply`, `--allow-remote`, `--limit N`). Candidates: phrase sources whose live bits are all pending with exactly one variant. Apply uses `claimSourceForRegeneration` (supersedes pending bits only) then `generateItemsForSource`. Approved cards untouched; pending edits lost.
8. `apps/api/src/knowledge-bit/ingestion-pipeline.md`: update "Meeting phrases" (3 options, choice rule, backfill).

## Slice 2: web (after slice 1)
1. Sizes, Triage only (`prominent`): `knowledge-bit-review-card-fields.tsx` add sizes `xlarge` (text-2xl) and `medium` (text-lg); Front text-xl -> text-2xl, Back text-sm -> text-lg. List view unchanged.
2. New `knowledge-bit-focus-sentence-options.tsx`: `role="radiogroup"`, each option a `role="radio"` button, `min-h-12`, text-lg, selected ring, tap selects; shared front shown above as text-2xl; hint line `hidden sm:block`: "Up/Down choose, Return good, X no".
3. `knowledge-bit-focus-card.tsx`: when `bit.answerChoice` render the options instead of `KnowledgeBitReviewVariantList`; props `selectedIndex`, `onSelect`. Review panel: `choice` state `{bitId, index}` (default 0); `decide('approve')` calls `keepVariants(bitId, [bit.variants[index].id])` for `answerChoice` bits, else `approve`.
4. `knowledge-bit-focus-keyboard.ts`: add `Enter` -> approve (ignored when target is button, link or summary), `ArrowUp`/`ArrowDown` -> `option-prev`/`option-next`, third hook arg `hasOptions` so arrows scroll normally otherwise and `preventDefault` only when options exist. `x` stays reject. Update `knowledge-bit-focus-shortcuts.ts` help rows.

## Slice 3: native (only after native-prefetch-background-save is finished; it owns `focus-triage-model+optimistic.swift`, `pending-review-triage-model+save.swift`, `PendingDecisionQueue`, and the failure prompt)
1. `Packages/PostAnkiAPI/.../PendingReviewModels.swift`: `PendingReviewBit.answerChoice` via `decodeIfPresent`, default false.
2. Mac `pending-review-triage-selection.swift`: `pickOne` mode (single id, `toggle` replaces, `move(by:)` clamps, `keepIds` = [selected], no 2-max hint). `pending-review-triage-key-map.swift`: `.up`/`.down` -> `.moveOption(-1/+1)`; `pending-review-triage-view.swift` returns `.ignored` for them unless `pickOne`. Return already = keep (through the queue), X = drop.
3. Mac `pending-review-triage-view.swift` / `pending-review-triage-card.swift`: for `pickOne` show the front once and the options as rows (radio mark, tap selects); footer hint "Up/Down choose, Return good, X no". Sizes: question `.title3` -> `.title2`, answer `.body` -> `.title3`.
4. iOS `focus-triage-card.swift`: sizes question `.title2` -> `.title`, answer `.body` -> `.title3`; for `answerChoice` show option rows (min height 44pt, tap selects) via a new `focus-triage-sentence-options.swift`. `FocusTriageModel.chosen[bitId]`; in `focus-triage-model+optimistic.swift` `decide(.approve)` enqueues `.keep([chosenId])` for `answerChoice` bits. Swipe right = accept chosen, left = reject, unchanged.
5. iOS undo after send: `applySettled` stores `dropped` on the log entry; `undoDecision` calls `APIClient.undoTriageKnowledgeBit` when dropped ids exist, so all 3 options return.
6. iOS hardware keyboard (optional, cheap): `.onKeyPress` on `focus-triage-view.swift` reusing the Mac key map: Up/Down choose, Return accept, X reject; only when `answerChoice`.

## Tests (vitest co-located; Swift Testing smoke tests, `scripts/run-mac.sh --test`)
- Draft/agent: should give the learner three sentence cards that share one situation front; should drop a sentence that rewords the phrase; should build sentences around the AI-corrected phrase when flagged; should ask once more when no sentence keeps the phrase, then import the plain phrase card instead of failing; should use one model call when the first answer is good; prompt asks for 3 sentences.
- Repo integration: should approve exactly the chosen sentence and drop the other two; should restore all three on undo; should keep only the first sentence when a phrase card is approved without a choice; should not bulk-approve phrase cards; should mark a phrase card with 3 sentences as a choice and an ordinary or single-sentence card as not.
- Backfill: should only pick phrase sources whose cards are all pending and single; dry run changes nothing.
- Web: should accept only the highlighted sentence on Return; should reject the phrase on X whatever sentence is highlighted; should move the highlight with Up/Down and leave scrolling alone on ordinary cards; should let a tap choose a sentence; should show larger question and answer text in Triage.
- Native: PostAnkiAPI decode test (field missing = false); selection should keep exactly one sentence; key map Up/Down move only for choice cards; should save only the chosen sentence on accept; should bring back all three on undo.

## Done when
- A new phrase import makes one model call per phrase (two only on bad output) and lands 3 options in Triage; flagged cards still show the banner and AI suggestion.
- Return keeps only the highlighted sentence as the card back; X rejects; touch users can tap an option; the other two never become cards.
- Triage question/answer text is visibly larger on web, iOS, Mac; list view unchanged.
- Backfill dry run lists the pending phrase cards and the call count; apply replaces only them.
- `npx tsc --noEmit`, lint, `npx vitest run` clean in api, shared, web; `scripts/run-mac.sh --test` passes.

## Defaults chosen
- Reuse variants + triage keep, no schema or endpoint: pattern already exists and has undo.
- Back = sentence only; the phrase stays as the bit body (Fact): one clean back; revisit if the phrase should be bold on the back.
- Sentences use the AI-corrected phrase when flagged: teaches natural English; one-line change in the target choice.
- 1 or 2 valid sentences are accepted (1 = plain approve): partial output still useful, fewer retries.
- Option text is read-only in Triage; edit after approval: keeps UI small.
- Server default-first approve and bulk skip: old clients and list view can never create three cards.
- Backfill is a script, dry run first, pending cards only: avoids surprise spend; run per batch of 100.
- Cost: sentences add roughly 60-100 output tokens per call, call count unchanged; backfill of N pending phrases is N calls (up to 2N on bad output), same order as the first import.
- Risks: long full-sentence phrases rarely yield 3 containing sentences (fallback covers it); the web list view still offers keep-all, server trims to one; a native client older than slice 3 sees `keep`-less approve and gets the first sentence.

END-OF-REPORT
